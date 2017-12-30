<?php
/**
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
 */

/**
 * Represents file annotations for a file.
 */
class FileAnnotationsContent extends JsonContent {
	public function __construct( $text ) {
		parent::__construct( $text, 'FileAnnotations' );
	}

	public function validate() {
		$annotationsStatus = $this->getData();
		$annotations = $annotationsStatus->getValue();

		if ( !is_object( $annotations ) ) {
			throw new JsonSchemaException( wfMessage( 'eventlogging-invalid-json' )->parse() );
		}

		$schema = include __DIR__ . '/FileAnnotationsSchema.php';

		$arrayAnnotations = (array)$annotations;

		$allAnnotations = isset( $arrayAnnotations['annotations'] )
			? $arrayAnnotations['annotations']
			: [];

		foreach ( $allAnnotations as $i => $annotation ) {
			$allAnnotations[$i] = (array)$annotation;
		}

		$arrayAnnotations['annotations'] = $allAnnotations;

		return EventLogging::schemaValidate( $arrayAnnotations, $schema );
	}

	public function isValid() {
		try {
			return parent::isValid() && $this->validate();
		} catch ( JsonSchemaException $e ) {
			return false;
		}
	}

	protected function fillParserOutput(
		Title $title,
		$revId,
		ParserOptions $options,
		$generateHtml,
		ParserOutput &$output
	) {
		parent::fillParserOutput( $title, $revId, $options, $generateHtml, $output );

		if ( $generateHtml && $this->isValid() ) {
			$fileTitle = Title::makeTitle(
				NS_FILE,
				$title->getDBkey()
			);

			$fileMsg = wfMessage(
				'fileannotations-go-to-filepage',
				$fileTitle->getPrefixedDBkey()
			)
				// Set a title to avoid implicit $wgTitle usage
				->title( $title )
				// Show in user language. Note that this automatically splits the parser cache per-language.
				->inLanguage( $options->getUserLangObj() );

			$output->setText(
				$fileMsg->parseAsBlock() .
				$output->getRawText()
			);
		}
	}
}
