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
	public static function onBeforePageDisplay( &$out, &$skin ) {
		// Dump it on every page.
		$out->addModules( [ 'ext.fileannotations' ] );
	}

	public static function onSkinTemplateNavigation( SkinTemplate &$sktemplate, array &$links ) {
		// Add the "File annotations" tab on file pages
		$title = $sktemplate->getTitle();
		if ( $title->canExist() && $title->inNamespace( NS_FILE ) ) {
			$fanTitle = Title::makeTitle(
				NS_FILE_ANNOTATIONS,
				$title->getDBkey()
			);

			$links['namespaces']['annotations'] = $sktemplate->tabAction(
				$fanTitle,
				'fileannotations-tab',
				false,
				'',
				true
			);
		}
	}

	public static function getCodeLanguage( Title $title, &$languageCode ) {
		if ( $title->inNamespace( NS_FILE_ANNOTATIONS ) ) {
			$languageCode = 'json';
			return false;
		}

		return true;
	}
}
