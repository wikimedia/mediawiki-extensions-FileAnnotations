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
use MediaWiki\MediaWikiServices;

class ApiFileAnnotations extends ApiQueryBase {
	const MIN_CACHE_TTL = WANObjectCache::TTL_MINUTE;
	const MAX_CACHE_TTL = WANObjectCache::TTL_DAY;

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

		$safeAsOf = $this->getSafeCacheAsOfForUser( 'commonswiki' );

		$cache = ObjectCache::getMainWANInstance();
		$cacheKey = $cache->makeKey( 'fileannotations', 'commonscategory', $categoryName );

		return $cache->getWithSetCallback(
			$cacheKey,
			self::MAX_CACHE_TTL,
			function ( $oldValue, &$ttl, array &$setOpts, $oldAsOf )
			use ( $cache, $categoryName, $cacheKey, $safeAsOf ) {
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
						'formatversion' => 2,
						'format' => 'json',
					],
				] );

				if ( $response['code'] == 200 ) {
					$imagesApiData = json_decode( $response['body'], true );
					$pages = $imagesApiData['query']['pages'];
				} else {
					$pages = [];

					$ttl = $cache::TTL_UNCACHEABLE;
				}

				$imagesHtml = '<div class="category-members">';

				$href = null;
				foreach ( $pages as $page ) {
					$info = $page['imageinfo'][0];
					$href = $info['descriptionurl'];
					$src = $info['thumburl'];

					$imagesHtml .=
						'<a class="category-member" href="' . htmlspecialchars( $href ) . '">' .
							'<img src="' . htmlspecialchars( $src ) . '" />' .
						'</a>';
				}

				$imagesHtml .= '</div>';

				$seeMoreHtml = $pages
					? '<a class="commons-see-more" href="' . htmlspecialchars( $href ) . '"></a>'
					: '';

				$html =
					'<div class="commons-category-annotation">' .
						$imagesHtml .
						$seeMoreHtml .
					'</div>';

				$setOpts['staleTTL'] = self::MAX_CACHE_TTL;
				self::purgeIfOutdated( $safeAsOf, $oldValue, $html, $cache, $cacheKey );
				$ttl = self::elasticCacheTTL( $oldValue, $html, $oldAsOf, $ttl );

				return $html;
			},
			[ 'minAsOf' => $safeAsOf ]
		);
	}

	protected function renderWikipediaAnnotation( $wpMatches ) {
		$articleName = $wpMatches[2];
		$language = $wpMatches[1];
		$safeAsOf = $this->getSafeCacheAsOfForUser( 'enwiki' );

		$cache = ObjectCache::getMainWANInstance();
		$cacheKey = $cache->makeKey( 'fileannotations', 'wikipediapage', $language, $articleName );

		return $cache->getWithSetCallback(
			$cacheKey,
			self::MAX_CACHE_TTL,
			function ( $oldValue, &$ttl, array &$setOpts, $oldAsOf )
			use ( $cache, $articleName, $language, $cacheKey, $safeAsOf ) {
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
						'formatversion' => 2,
						'format' => 'json',
					],
				] );

				if ( $response['code'] == 200 ) {
					$articleApiData = json_decode( $response['body'], true );
					$pages = $articleApiData['query']['pages'];
				} else {
					$pages = [];

					$ttl = $cache::TTL_UNCACHEABLE;
				}

				$page = $pages[0];
				$html =
					'<div class="wikipedia-article-annotation">' .
						// The API result here should be safe HTML
						$page['extract'] .
						'<p class="pageimage">' .
							'<img src="' .
								htmlspecialchars( $page['thumbnail']['source'] ) .
								'" width="' .
								htmlspecialchars( $page['thumbnail']['width'] ) .
								'" height="' .
								htmlspecialchars( $page['thumbnail']['height'] ) .
							'" />' .
						'</p>' .
					'</div>';

				$setOpts['staleTTL'] = self::MAX_CACHE_TTL;
				self::purgeIfOutdated( $safeAsOf, $oldValue, $html, $cache, $cacheKey );
				$ttl = self::elasticCacheTTL( $oldValue, $html, $oldAsOf, $ttl );

				return $html;
			},
			[ 'minAsOf' => $safeAsOf ]
		);
	}

	protected function renderWikidataAnnotation( $wdMatches ) {
		$entityId = $wdMatches[2];
		$currentLang = $this->getLanguage()->getCode();
		$safeAsOf = $this->getSafeCacheAsOfForUser( 'wikidatawiki' );

		$cache = ObjectCache::getMainWANInstance();
		$cacheKey = $cache->makeKey( 'fileannotations', 'wikidataentity', $currentLang, $entityId );

		return $cache->getWithSetCallback(
			$cacheKey,
			self::MAX_CACHE_TTL,
			function ( $oldValue, &$ttl, array &$setOpts, $oldAsOf )
			use ( $cache, $entityId, $currentLang, $safeAsOf, $cacheKey ) {
				$client = new MultiHttpClient( [] );

				$response = $client->run( [
					'method' => 'GET',
					'url' => 'https://www.wikidata.org/w/api.php',
					'query' => [
						'action' => 'wbgetentities',
						'ids' => $entityId,
						'languages' => 'en|' . $currentLang,
						'props' => 'labels|descriptions|claims',
						'formatversion' => 2,
						'format' => 'json',
					],
				] );

				if ( $response['code'] == 200 ) {
					$entityApiData = json_decode( $response['body'], true );
					$entity = $entityApiData['entities'][$entityId];
				} else {
					$ttl = $cache::TTL_UNCACHEABLE;

					return '';
				}

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
							htmlspecialchars( $labels[$currentLang]['value'] ) .
						'</h2>';
				} elseif ( isset( $labels['en'] ) ) {
					// Blatantly strange fallback, but we don't want to have
					// no label...hopefully this works for 99% of things.
					$label =
						'<h2 class="wikidata-label">' .
							htmlspecialchars( $labels['en']['value'] ) .
						'</h2>';
				}

				if ( isset( $descriptions[$currentLang] ) ) {
					$description =
						'<p class="wikidata-description">' .
							htmlspecialchars( $descriptions[$currentLang]['value'] ) .
						'</p>';
				} elseif ( isset( $descriptions['en'] ) ) {
					$description =
						'<p class="wikidata-description">' .
							htmlspecialchars( $descriptions['en']['value'] ) .
						'</p>';
				}

				$html = '<div class="wikidata-entity-annotation">';
				if ( !is_null( $imageHtml ) ) {
					$html .= $imageHtml;
				}
				if ( !is_null( $label ) || !is_null( $description ) ) {
					$html .= '<div class="text-content">';
					if ( !is_null( $label ) ) {
						$html .= $label;
					}
					if ( !is_null( $description ) ) {
						$html .= $description;
					}
				}

				$setOpts['staleTTL'] = self::MAX_CACHE_TTL;
				self::purgeIfOutdated( $safeAsOf, $oldValue, $html, $cache, $cacheKey );
				$ttl = self::elasticCacheTTL( $oldValue, $html, $oldAsOf, $ttl );

				return $html;
			},
			[ 'minAsOf' => $safeAsOf ]
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
				'formatversion' => 2,
				'format' => 'json',
			]
		] );

		$imageApiData = json_decode( $response['body'], true );

		$pages = $imageApiData['query']['pages'];
		$imageLink = null;

		$page = $pages[0];
		// There's only one page. Add HTML here.
		$info = $page['imageinfo'][0];
		return
			'<div class="wikidata-image">' .
				'<a class="commons-image" href="' . htmlspecialchars( $info['descriptionurl'] ) . '">' .
					'<img src="' . htmlspecialchars( $info['thumburl'] ) . '" />' .
				'</a>' .
			'</div>';
	}

	protected function parseAnnotation( $text, $faTitle, Parser $parser, $popts ) {
		$presult = $parser->parse( $text, $faTitle, $popts );
		$parsed = $presult->mText;

		// Check to see if we can return a special display for this annotation.
		// We can't just the $text against the regexes, since the link might be generated from a
		// wikitext link like [[commons:Foo]] or a template.
		$dom = new DOMDocument();
		$dom->loadXML( '<root>' . $presult->mText . '</root>' );

		$xpath = new DOMXPath( $dom );
		// If the output is just a single link `<a>` wrapped in a single paragraph `<p>`, optionally
		// with some whitespace around it, do something special.
		$matches = $xpath->query( '//root[count(*)=1]/p[count(*)=1][normalize-space(text())=""]/a' );
		$possibleLink = $matches->item( 0 );

		if ( $possibleLink ) {
			// Find out if the link is something we care about
			/** @noinspection PhpUndefinedFieldInspection */
			$href = $possibleLink->attributes->getNamedItem( 'href' )->value;

			$commonsMatches = [];
			$commonsCategoryMatch = preg_match(
				'%^https?://commons\.wikimedia\.org.*(Category:.*)%',
				$href,
				$commonsMatches
			);

			$wpMatches = [];
			$wpArticleMatch = preg_match(
				'%^(https?://[a-zA-Z\-]+\.wikipedia\.org)/wiki/(.*)%',
				$href,
				$wpMatches
			);

			$wdMatches = [];
			$wdEntityMatch = preg_match(
				'%https?://(www\.)?wikidata\.org/.*(Q\d+)%',
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

	/**
	 * @param string|bool $oldValue
	 * @param string $newValue
	 * @param float|null $oldAsOf
	 * @param integer $ttl Nominal/maximum TTL
	 * @return int
	 */
	private static function elasticCacheTTL( $oldValue, $newValue, $oldAsOf, $ttl ) {
		if ( $oldValue === $newValue ) {
			$oldAge = (int)ceil( microtime( true ) - $oldAsOf );

			return min( $oldAge * 2, $ttl );
		}

		return min( self::MIN_CACHE_TTL, $ttl );
	}

	/**
	 * @param float|null $safeAsOf
	 * @param string|bool $oldValue
	 * @param string $html
	 * @param WANObjectCache $cache
	 * @param string $cacheKey
	 * @return bool Whether key was purged
	 */
	private static function purgeIfOutdated( $safeAsOf, $oldValue, $html, $cache, $cacheKey ) {
		if ( $safeAsOf && $oldValue !== false && $oldValue !== $html ) {
			// User possibly expecting to see the new value and it does not match.
			// Delete the key from all datacenters and yeild the new value.
			$cache->delete( $cacheKey );

			return true;
		}

		return false;
	}

	/**
	 * If a user recently made changes to one of the shared wiki's, try to avoid using a
	 * stale cache keys for the fileinfo API queries to that wiki and also purge the keys
	 * if they are outdated, so that it shows in all datacenters
	 *
	 * @param string $dbName
	 * @return mixed
	 */
	private function getSafeCacheAsOfForUser( $dbName ) {
		// If this site is part of the WMF cluster, these timestamp will be set
		$lbFactory = MediaWikiServices::getInstance()->getDBLoadBalancerFactory();
		$touched = $lbFactory->getChronologyProtectorTouched( $dbName );
		// Account for DB replica lag with HOLDOFF_TTL
		return is_float( $touched ) ? ( $touched + WANObjectCache::HOLDOFF_TTL ) : null;
	}
}
