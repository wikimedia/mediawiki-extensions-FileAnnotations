( function ( $, mw ) {
	var pageAnnotator,
		pageTitle = mw.Title.newFromText( mw.config.get( 'wgPageName' ) ),
		isFilePage = pageTitle.getNamespaceId() === mw.config.get( 'wgNamespaceIds' ).file,
		$fileLink = $( '#file > a' );

	if ( isFilePage ) {
		// This is a file page, so just dump the main image into the
		// annotator class, with editing and a notification below the image.
		pageAnnotator = new mw.FileAnnotator( {
			$container: $( '#file' ),
			$infoContainer: $fileLink,
			title: pageTitle,
			editing: true
		} );
	} else {
		// Not a file page, so look for explicitly enabled images
		$( '.enable-file-annotations' ).each( function () {
			var $div = $( this );

			$div.find( 'a.image' ).each( function () {
				var thumbAnnotator,
					$link = $( this ),
					$img = $link.find( 'img' ),
					$container = $( '<div>' )
						.addClass( 'fileannotations-standin-container' )
						.css( {
							display: 'inline-block'
						} );

				$link.after( $container );
				$container.append( $link );

				thumbAnnotator = new mw.FileAnnotator( {
					$container: $container,
					$infoContainer: $link,
					title: mw.Title.newFromImg( $img ),
					editing: false
				} );
			} );
		} );
	}
}( jQuery, mediaWiki ) );
