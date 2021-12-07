<?php

/**
 * FileAnnotations extension
 *
 * This PHP entry point is deprecated. Please use wfLoadExtension() and the extension.json file
 * instead. See https://www.mediawiki.org/wiki/Manual:Extension_registration for more details.
 *
 * @file
 * @ingroup Extensions
 * @copyright 2015 Mark Holmquist and others; see AUTHORS.txt
 * @license GPL-2.0-or-later
 */

if ( function_exists( 'wfLoadExtension' ) ) {
	wfLoadExtension( 'FileAnnotations' );
	wfWarn(
		'Deprecated PHP entry point used for FileAnnotations extension. Please use wfLoadExtension instead, ' .
		'see https://www.mediawiki.org/wiki/Extension_registration for more details.'
	);
	return true;
}

die( 'This version of the FileAnnotations extension requires MediaWiki 1.34+.' );
