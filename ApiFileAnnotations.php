<?php
/**
 * API module for fetching all file annotations for editing or viewing.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 * http://www.gnu.org/copyleft/gpl.html
 *
 * @file
 * @ingroup Api
 *
 * @copyright 2015 Mark Holmquist
 * @license GNU General Public License version 2.0
 */

class ApiFileAnnotations extends ApiQueryBase {
	// 5 minutes - long enough to avoid crashing the servers with a lot
	// of repeated requests for the same data, but not long enough so it's
	// hard to update information quickly. Cache not invalidated by changes
	// to Wikidata, Wikipedia, or Commons.
	const CACHE_TTL = 300;

	public function __construct( $query, $moduleName ) {
		parent::__construct( $query, $moduleName, 'fa' );
	}

	public function execute() {
		$params = $this->extractRequestParams();
		$shouldParse = $params['parse'];

		$pageIds = $this->getPageSet()->getGoodAndMissingTitlesByNamespace();

		if ( !empty( $pageIds[NS_FILE] ) ) {
			$titles = array_keys( $pageIds[NS_FILE] );
			asort( $titles ); // Ensure the order is always the same

			foreach ( $titles as $title ) {
				/** @noinspection PhpUndefinedConstantInspection */
				$faTitle = Title::makeTitle(
					NS_FILE_ANNOTATIONS,
					$title
				);

				$page = WikiPage::factory( $faTitle );
				$content = $page->getContent();
				if ( $content instanceof FileAnnotationsContent ) {
					$dataStatus = $content->getData();
					$data = $dataStatus->getValue();

					$annotations = $data->annotations;
				}

				$parser = new Parser();
				$popts = ParserOptions::newFromUser( $this->getUser() );

				$annotationsData = [];

				if ( !empty( $annotations ) ) {
					foreach ( $annotations as $annotation ) {
						$annotationsData[] = $this->getAnnotationData(
							$shouldParse,
							$faTitle,
							$annotation,
							$parser,
							$popts
						);
					}
				}

				$this->addPageSubItem( $pageIds[NS_FILE][$title], $annotationsData );
			}
		}
	}

	protected function renderCommonsAnnotation( $commonsMatches ) {
		$categoryName = $commonsMatches[1];

		$cache = ObjectCache::getMainWANInstance();

		return $cache->getWithSetCallback(
			$cache->makeKey( 'fileannotations', 'commonscategory', $categoryName ),
			self::CACHE_TTL,
			function ( $oldValue, &$ttl, array &$setOpts ) use ( $categoryName ) {
				$client = new MultiHttpClient( [] );

				$response = $client->run( [
					'method' => 'GET',
					'url' => 'https://commons.wikimedia.org/w/api.php',
					'query' => [
						'action' => 'query',
						'prop' => 'imageinfo',
						'generator' => 'categorymembers',
						'gcmtype' => 'file',
						'gcmtitle' => $categoryName,
						'gcmlimit' => 5,
						'iiprop' => 'url',
						'iiurlwidth' => 100,
						'iiurlheight' => 100,
						'format' => 'json',
					],
				] );

				$imagesApiData = json_decode( $response['body'], true );

				$pages = $imagesApiData['query']['pages'];

				$imagesHtml = '<div class="category-members">';

				$href = null;
				foreach ( $pages as $id => $page ) {
					$info = $page['imageinfo'][0];
					$href = $info['descriptionurl'];
					$src = $info['thumburl'];

					$imagesHtml .=
						'<a class="category-member" href="' . $href . '">' .
							'<img src="' . $src . '" />' .
						'</a>';
				}

				$imagesHtml .= '</div>';

				// @FIXME: i18n!
				$seeMoreHtml = $pages
					? '<a href="' . $href . '">' . 'See more images' . '</a>'
					: '';

				return
					'<div class="commons-category-annotation">' .
						$imagesHtml .
						$seeMoreHtml .
					'</div>';
			}
		);
	}

	protected function renderWikipediaAnnotation( $wpMatches ) {
		$articleName = $wpMatches[2];
		$language = $wpMatches[1];

		$cache = ObjectCache::getMainWANInstance();

		return $cache->getWithSetCallback(
			$cache->makeKey( 'fileannotations', 'wikipediapage', $language, $articleName ),
			self::CACHE_TTL,
			function ( $oldValue, &$ttl, array &$setOpts ) use ( $articleName, $language ) {
				$client = new MultiHttpClient( [] );

				$response = $client->run( [
					'method' => 'GET',
					'url' => $language . '/w/api.php',
					'query' => [
						'action' => 'query',
						'titles' => $articleName,
						'prop' => 'pageimages|extracts',
						'piprop' => 'thumbnail|name',
						'pithumbsize' => 250,
						'exsentences' => 4,
						'format' => 'json',
					],
				] );

				$articleApiData = json_decode( $response['body'], true );

				$pages = $articleApiData['query']['pages'];

				$page = reset( $pages );
				// There's only one page, so just do it here
				return
					'<div class="wikipedia-article-annotation">' .
						$page['extract'] .
						'<p class="pageimage">' .
							'<img src="' .
								$page['thumbnail']['source'] .
								'" width="' .
								$page['thumbnail']['width'] .
								'" height="' .
								$page['thumbnail']['height'] .
							'" />' .
						'</p>' .
					'</div>';
			}
		);
	}

	protected function renderWikidataAnnotation( $wdMatches ) {
		$entityId = $wdMatches[2];
		$currentLang = $this->getLanguage()->getCode();

		$cache = ObjectCache::getMainWANInstance();

		return $cache->getWithSetCallback(
			$cache->makeKey( 'fileannotations', 'wikidataentity', $currentLang, $entityId ),
			self::CACHE_TTL,
			function ( $oldValue, &$ttl, array &$setOpts ) use ( $entityId, $currentLang ) {
				$client = new MultiHttpClient( [] );

				$response = $client->run( [
					'method' => 'GET',
					'url' => 'https://www.wikidata.org/w/api.php',
					'query' => [
						'action' => 'wbgetentities',
						'ids' => $entityId,
						'languages' => 'en|' . $currentLang,
						'props' => 'labels|descriptions|claims',
						'format' => 'json',
					],
				] );

				$entityApiData = json_decode( $response['body'], true );

				$entity = $entityApiData['entities'][$entityId];

				$labels = $entity['labels'];
				$descriptions = $entity['descriptions'];
				$claims = $entity['claims'];

				$imageHtml = null;

				foreach ( $claims as $claimid => $claim ) {
					switch ( $claimid ) {
						case 'P18':
							// Main image. Fetch imageinfo and render.
							$imageHtml = $this->renderWdImage(
								$claim[0]['mainsnak']['datavalue']['value']
							);
							break;

						default:
							continue;
					}
				}

				$label = null;
				$description = null;

				if ( isset( $labels[$currentLang] ) ) {
					$label =
						'<h2 class="wikidata-label">' .
							$labels[$currentLang]['value'] .
						'</h2>';
				} elseif ( isset( $labels['en'] ) ) {
					// Blatantly strange fallback, but we don't want to have
					// no label...hopefully this works for 99% of things.
					$label =
						'<h2 class="wikidata-label">' .
							$labels['en']['value'] .
						'</h2>';
				}

				if ( isset( $descriptions[$currentLang] ) ) {
					$description =
						'<p class="wikidata-description">' .
							$descriptions[$currentLang]['value'] .
						'</p>';
				} elseif ( isset( $descriptions['en'] ) ) {
					$description =
						'<p class="wikidata-description">' .
							$descriptions['en']['value'] .
						'</p>';
				}

				$parsed = '<div class="wikidata-entity-annotation">';

				if ( !is_null( $imageHtml ) ) {
					$parsed .= $imageHtml;
				}

				if ( !is_null( $label ) || !is_null( $description ) ) {
					$parsed .= '<div class="text-content">';

					if ( !is_null( $label ) ) {
						$parsed .= $label;
					}

					if ( !is_null( $description ) ) {
						$parsed .= $description;
					}
				}

				return $parsed;
			}
		);
	}

	protected function renderWdImage( $imageTitle ) {
		$client = new MultiHttpClient( [] );

		$response = $client->run( [
			'method' => 'GET',
			'url' => 'https://commons.wikimedia.org/w/api.php',
			'query' => [
				'action' => 'query',
				'prop' => 'imageinfo',
				'titles' => 'File:' . $imageTitle,
				'iiprop' => 'url',
				'iiurlwidth' => 200,
				'iiurlheight' => 200,
				'format' => 'json',
			]
		] );

		$imageApiData = json_decode( $response['body'], true );

		$pages = $imageApiData['query']['pages'];
		$imageLink = null;

		$page = reset( $pages );
		// There's only one page. Add HTML here.
		$info = $page['imageinfo'][0];
		return
			'<div class="wikidata-image">' .
				'<a class="commons-image" href="' . $info['descriptionurl'] . '">' .
					'<img src="' . $info['thumburl'] . '" />' .
				'</a>' .
			'</div>';
	}

	protected function parseAnnotation( $text, $faTitle, Parser $parser, $popts ) {
		$presult = $parser->parse( $text, $faTitle, $popts );
		$parsed = $presult->mText;

		// Check to see if we can return a special display for this annotation.
		$dom = new DOMDocument();
		$domFragment = $dom->createDocumentFragment();
		$domFragment->appendXml( $presult->mText );

		// The first element will always be a paragraph. Get its first child.
		$possibleLink = $domFragment->firstChild->firstChild;

		// Check if it's a link element.
		if ( $possibleLink->nodeType === XML_ELEMENT_NODE && $possibleLink->nodeName === 'a' ) {
			// Find out if the link is something we care about
			/** @noinspection PhpUndefinedFieldInspection */
			$href = $possibleLink->attributes->getNamedItem( 'href' )->value;

			$commonsMatches = [];
			$commonsCategoryMatch = preg_match(
				'%^https?://commons.wikimedia.org.*(Category:.*)%',
				$href,
				$commonsMatches
			);

			$wpMatches = [];
			$wpArticleMatch = preg_match(
				'%^(https?://.*.wikipedia.org)/wiki/(.*)%',
				$href,
				$wpMatches
			);

			$wdMatches = [];
			$wdEntityMatch = preg_match(
				'%https?://(www\.)?wikidata.org/.*(Q\d+)%',
				$href,
				$wdMatches
			);

			if ( $commonsCategoryMatch === 1 ) {
				$parsed = $this->renderCommonsAnnotation(
					$commonsMatches
				);
			}

			if ( $wpArticleMatch === 1 ) {
				$parsed = $this->renderWikipediaAnnotation(
					$wpMatches
				);
			}

			if ( $wdEntityMatch === 1 ) {
				$parsed = $this->renderWikidataAnnotation(
					$wdMatches
				);
			}
		}

		return $parsed;
	}

	protected function getAnnotationData( $shouldParse, $faTitle, $annotation, $parser, $popts ) {
		$text = $annotation->content;

		$annotationData = [
			'text' => $text
		];

		foreach ( $annotation as $key => $val ) {
			if ( $key === 'content' ) {
				continue;
			}

			$annotationData[$key] = $val;
		}

		if ( $shouldParse ) {
			$annotationData['parsed'] = $this->parseAnnotation(
				$text,
				$faTitle,
				$parser,
				$popts
			);
		}

		return $annotationData;
	}

	public function getAllowedParams() {
		return [
			'parse' => [
				ApiBase::PARAM_TYPE => 'boolean',
			],
		];
	}
}
