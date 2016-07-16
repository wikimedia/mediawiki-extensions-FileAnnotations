( function ( $, mw ) {
	var api = new mw.Api(),
		pageTitle = mw.Title.newFromText( mw.config.get( 'wgPageName' ) ),
		isFilePage = pageTitle.getNamespaceId() === 6;

	$( '.annotated-file' ).each( function () {
		var imgTitle, imageInfoPromise, offset, imgh, imgw,
			$annotations = $( this ),
			$annotationWrapper = $( '<div>' ).addClass( 'annotation-wrapper' ),
			$img = $annotations.find( 'img' );

		if ( !$img || $img.length < 1 && isFilePage ) {
			// Assume we're annotating the file whose page we're on.
			$img = $( '#file img' );
		}

		if ( !$img || $img.length < 1 ) {
			// No image found, what are we supposed to annotate?
			// The irony that this is called "file annotations" when all we handle
			// are images is not lost on me. XXX TODO HACK
			return;
		}

		offset = $img.offset();
		imgw = $img.width();
		imgh = $img.height();
		imgTitle = mw.Title.newFromImg( $img );

		$annotationWrapper.css( {
			top: offset.top,
			left: offset.left,
			height: imgh,
			width: imgw
		} );

		$( 'body' ).append( $annotationWrapper );

		imageInfoPromise = api.get( {
			action: 'query',
			prop: 'imageinfo',
			indexpageids: true,
			titles: imgTitle.getPrefixedDb(),
			iiprop: 'size'
		} );

		$annotations.find( '.file-annotation' ).each( function ( i, annotation ) {
			var $annotation = $( annotation ),
				$annotationBox = $( '<div>' ).addClass( 'annotation-box' ),
				height = $annotation.attr( 'data-h' ),
				width = $annotation.attr( 'data-w' ),
				x = $annotation.attr( 'data-x' ),
				y = $annotation.attr( 'data-y' );

			imageInfoPromise.done( function ( data ) {
				var ii = data.query.pages[ data.query.pageids[ 0 ] ].imageinfo[ 0 ],
					fw = ii.width,
					fh = ii.height,
					adjustRatioX = imgw / fw,
					adjustRatioY = imgh / fh,
					adjustedX = x * adjustRatioX,
					adjustedWidth = width * adjustRatioX,
					adjustedY = y * adjustRatioY,
					adjustedHeight = height * adjustRatioY;

				$annotationBox.css( {
					top: adjustedY,
					left: adjustedX,
					height: adjustedHeight,
					width: adjustedWidth
				} );

				$annotationBox.append( $annotation );
				$annotation.removeAttr( 'style' );
				$annotation.css( {
					top: adjustedHeight - 10,
					left: adjustedWidth - 10
				} );

				$annotationWrapper.append( $annotationBox );
			} );
		} );
	} );
}( jQuery, mediaWiki ) );
