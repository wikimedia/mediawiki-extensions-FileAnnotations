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
	public function __construct( $query, $moduleName ) {
		parent::__construct( $query, $moduleName, 'fa' );
	}

	public function execute() {
		wfProfileIn( __METHOD__ );

		$params = $this->extractRequestParams();
		$shouldParse = $params['parse'];

		$pageIds = $this->getPageSet()->getGoodAndMissingTitlesByNamespace();

		if ( !empty( $pageIds[NS_FILE] ) ) {
			$titles = array_keys( $pageIds[NS_FILE] );
			asort( $titles ); // Ensure the order is always the same

			foreach ( $titles as $title ) {
				$faTitle = Title::makeTitle(
					NS_FILE_ANNOTATIONS,
					$title
				);

				$parser = new Parser();
				$popts = ParserOptions::newFromUser( $this->getUser() );

				$page = WikiPage::factory( $faTitle );
				$content = $page->getContent();
				if ( !empty( $content ) ) {
					$dataStatus = $content->getData();
					$data = $dataStatus->getValue();

					$annotations = $data->annotations;
				}

				$annotationsData = [];

				if ( !empty( $annotations ) ) {
					foreach ( $annotations as $annotation ) {
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
							$presult = $parser->parse( $text, $faTitle, $popts );
							$annotationData['parsed'] = $presult->mText;

							// Check to see if we can return a special display for this annotation.
							$dom = new DOMDocument();
							$domFragment = $dom->createDocumentFragment();
						   	$domFragment->appendXml( $presult->mText );

							// The first element will always be a paragraph. Get its first child.
							$possibleLink = $domFragment->firstChild->firstChild;

							// Check if it's a link element.
							if ( $possibleLink->nodeType === XML_ELEMENT_NODE && $possibleLink->nodeName === 'a' ) {
								// Find out if the link is something we care about.
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
									$categoryName = $commonsMatches[1];

									$imagesApiDataStr = file_get_contents(
										'https://commons.wikimedia.org/w/api.php?' .
										'action=query&prop=imageinfo&generator=categorymembers' .
										'&gcmtype=file&gcmtitle=' .
										urlencode( $categoryName ) .
										'&gcmlimit=5&iiprop=url&iiurlwidth=100' .
										'&iiurlheight=100&format=json'
									);

									$imagesApiData = json_decode( $imagesApiDataStr, true );

									$pages = $imagesApiData['query']['pages'];

									$imagesHtml = '<div class="category-members">';

									foreach ( $pages as $id => $page ) {
										$info = $page['imageinfo'][0];
										$imagesHtml .=
											'<a class="category-member" href="' . $info['descriptionurl'] . '">' .
												'<img src="' . $info['thumburl'] . '" />' .
											'</a>';
									}

									$imagesHtml .= '</div>';

									$annotationData['parsed'] =
										'<div class="commons-category-annotation">' .
											$imagesHtml .
											'<a href="' . $href . '">' .
												'See more images' .
											'</a>' .
										'</div>';
								}

								if ( $wpArticleMatch === 1 ) {
									$articleName = $wpMatches[2];

									$articleApiDataStr = file_get_contents(
										$wpMatches[1] .
										'/w/api.php?action=query' .
										'&titles=' . urlencode( $articleName ) .
										'&prop=pageimages|extracts' .
										'&piprop=thumbnail|name' .
										'&pithumbsize=250' .
										'&exsentences=4' .
										'&format=json'
									);

									$articleApiData = json_decode( $articleApiDataStr, true );

									$pages = $articleApiData['query']['pages'];

									foreach ( $pages as $id => $page ) {
										// There's only one page, so just do it here
										$annotationData['parsed'] =
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
								}

								if ( $wdEntityMatch === 1 ) {
									$entityId = $wdMatches[2];
									$currentLang = $this->getLanguage()->getCode();

									$entityApiDataStr = file_get_contents(
										'https://www.wikidata.org/w/api.php' .
										'?action=wbgetentities' .
										'&ids=' . $entityId .
										'&languages=en|' . $currentLang .
										'&props=labels|descriptions|claims' .
										'&format=json'
									);

									$entityApiData = json_decode( $entityApiDataStr, true );

									$entity = $entityApiData['entities'][$entityId];

									$labels = $entity['labels'];
									$descriptions = $entity['descriptions'];
									$claims = $entity['claims'];

									$annotationData['parsed'] = '<div class="wikidata-entity-annotation">';

									foreach ( $claims as $claimid => $claim ) {
										switch ( $claimid ) {
											case 'P18':
												// Main image. Fetch imageinfo and render.
												$imageApiDataStr = file_get_contents(
													'https://commons.wikimedia.org/w/api.php' .
													'?action=query&prop=imageinfo' .
													'&titles=File:' . urlencode( $claim[0]['mainsnak']['datavalue']['value'] ) .
													'&iiprop=url&iiurlwidth=200' .
													'&iiurlheight=200&format=json'
												);

												$imageApiData = json_decode( $imageApiDataStr, true );

												$pages = $imageApiData['query']['pages'];

												$annotationData['parsed'] .= '<div class="wikidata-image">';

												foreach ( $pages as $id => $page ) {
													// There's only one page. Add HTML here.
													$info = $page['imageinfo'][0];
													$annotationData['parsed'] .=
														'<a class="commons-image" href="' . $info['descriptionurl'] . '">' .
															'<img src="' . $info['thumburl'] . '" />' .
														'</a>';
													break;
												}

												$annotationData['parsed'] .= '</div>';

											default:
												continue;
										}
									}

									$annotationData['parsed'] .= '<div class="text-content">';

									if ( isset( $labels[$currentLang] ) ) {
										$annotationData['parsed'] .=
											'<h2 class="wikidata-label">' .
												$labels[$currentLang]['value'] .
											'</h2>';
									} elseif ( isset( $labels['en'] ) ) {
										// Blatantly strange fallback, but we don't want to have
										// no label...hopefully this works for 99% of things.
										$annotationData['parsed'] .=
											'<h2 class="wikidata-label">' .
												$labels['en']['value'] .
											'</h2>';
									}

									if ( isset( $descriptions[$currentLang] ) ) {
										$annotationData['parsed'] .=
											'<p class="wikidata-description">' .
												$descriptions[$currentLang]['value'] .
											'</p>';
									} elseif ( isset( $descriptions['en'] ) ) {
										$annotationData['parsed'] .=
											'<p class="wikidata-description">' .
												$descriptions['en']['value'] .
											'</p>';
									}

									$annotationData['parsed'] .= '</div>';

									$annotationData['parsed'] .= '</div>';
								}
							}
						}
						$annotationsData[] = $annotationData;
					}
				}

				$this->addPageSubItem( $pageIds[NS_FILE][$title], $annotationsData );
			}
		}
	}

	public function getAllowedParams() {
		return [
			'parse' => [
				ApiBase::PARAM_TYPE => 'boolean',
			],
		];
	}
}
