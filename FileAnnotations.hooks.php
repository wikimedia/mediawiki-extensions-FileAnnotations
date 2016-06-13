<?php
/**
 * Hooks for FileAnnotations extension
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
 * @ingroup Extensions
 */

class FileAnnotationsHooks {
	public static function onRegistration() {
		return true;
	}

	public static function onSetup() {
		return true;
	}

	public static function getModulesForFilePage( &$out, &$skin ) {
		if ( $out->getTitle()->inNamespace( NS_FILE ) ) {
			$out->addModules( array( 'fileannotations' ) );
		}
	}

	public static function onParserSetup( Parser $parser ) {
		$parser->setHook( 'annotation', 'FileAnnotationsHooks::renderAnnotation' );
		$parser->setHook( 'annotatedfile', 'FileAnnotationsHooks::renderAnnotatedFile' );
		return true;
	}

	public static function renderAnnotatedFile( $input, array $args, Parser $parser, PPFrame $frame ) {
		$output = '<div class="annotated-file">' .
			$parser->recursiveTagParse( $input, $frame ) .
			'</div>';

		return $output;
	}

	public static function renderAnnotation( $input, array $args, Parser $parser, PPFrame $frame ) {
		$output = '<div class="file-annotation" style="display:none"';

		if ( isset( $args['x'] ) ) {
			$output .= ' data-x="' .
				htmlspecialchars( $args['x'] ) .
				'"';
		}

		if ( isset( $args['y'] ) ) {
			$output .= ' data-y="' .
				htmlspecialchars( $args['y'] ) .
				'"';
		}

		if ( isset( $args['w'] ) ) {
			$output .= ' data-w="' .
				htmlspecialchars( $args['w'] ) .
				'"';
		}

		if ( isset( $args['h'] ) ) {
			$output .= ' data-h="' .
				htmlspecialchars( $args['h'] ) .
				'"';
		}

		$output .= '>'
			.
			$parser->recursiveTagParse( $input, $frame ) .
			'</div>';

		return $output;
	}
}
