<?php
/**
 * File Annotations Content Handler
 *
 * @file
 * @ingroup Extensions
 * @ingroup FileAnnotations
 *
 * @author Mark Holmquist <marktraceur@gmail.com>
 */

class FileAnnotationsContentHandler extends JsonContentHandler {

	public function __construct( $modelId = 'FileAnnotations' ) {
		parent::__construct( $modelId );
	}

	public function canBeUsedOn( Title $title ) {
		return $title->inNamespace( NS_FILE_ANNOTATIONS );
	}

	protected function getContentClass() {
		return 'FileAnnotationsContent';
	}
}
