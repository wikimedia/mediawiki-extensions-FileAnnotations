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
