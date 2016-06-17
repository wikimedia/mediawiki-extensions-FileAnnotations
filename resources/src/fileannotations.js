( function ( $, mw ) {
	var createButton, $annotationsContainer, $mainImage,
		annotationsCache, offset, $annotationInfo,
		api = new mw.Api(),
		pageTitle = mw.Title.newFromText( mw.config.get( 'wgPageName' ) ),
		annotationsTitle = mw.Title.newFromText( 'File_Annotations:' + pageTitle.getMain() ),
		isFilePage = pageTitle.getNamespaceId() === 6,
		$fileLink = $( '#file' );

	function getAnnotationsJSON( pageTitle ) {
		return api.get( {
			action: 'query',
			prop: 'revisions',
			rvprop: 'content',
			indexpageids: true,
			titles: pageTitle.getPrefixedDb()
		} ).then( function ( data ) {
			var rv, text, annotations,
				pages = data.query.pages,
				pageid = data.query.pageids[ 0 ],
				page = pages[ pageid ],
				revisions = page.revisions;

			if ( revisions ) {
				rv = revisions[ 0 ];
				text = rv[ '*' ];
				annotations = JSON.parse( text );
			} else {
				// Fake it, give the rest of the code an empty list
				annotations = {
					annotations: []
				};
			}

			return annotations;
		} );
	}

	function saveUpdatedAnnotations( annotations, pageTitle, summary ) {
		return api.postWithToken( 'csrf', {
			action: 'edit',
			title: pageTitle.getPrefixedDb(),
			text: JSON.stringify( annotations ),
			summary: summary
		} );
	}

	/**
	 * Get the HTML version of the file annotations, so we can show them on
	 * the page.
	 *
	 * @return {jQuery.Promise}
	 */
	function getAnnotationsHTML( imageTitle ) {
		if ( annotationsCache === undefined ) {
			if ( !isFilePage ) {
				annotationsCache = $.Deferred().reject( 'Not a file page, aborting request for annotations' );
			} else {
				annotationsCache = api.get( {
					action: 'query',
					indexpageids: true,
					prop: [ 'fileannotations', 'imageinfo' ],
					titles: imageTitle.getPrefixedDb(),
					faparse: true,
					iiprop: 'size'
				} ).then( function ( data ) {
					if ( data.error ) {
						return $.Deferred().reject( data.error );
					}

					return data;
				} );
			}
		}

		return annotationsCache;
	}

	/**
	 * Creates an interface for editing an annotation.
	 *
	 * @param {jQuery} $container Where to put the editor interface.
	 * @param {string} text The wikitext of the annotation.
	 * @return {jQuery.promise} Resolved with the new text if annotation is saved, rejected if annotation is discarded.
	 */
	function createAnnotationTextEditor( $container, text ) {
		var deferred = $.Deferred(),
			$annotationEditor = $( '<div>' )
				.addClass( 'annotation-editor' ),
			annotationText = new OO.ui.TextInputWidget( {
				multiline: true
			} ),
			annotationSave = new OO.ui.ButtonWidget( {
				label: mw.message( 'save-fileannotation' ).text(),
				icon: 'check',
				flags: [ 'constructive', 'primary' ]
			} ),
			annotationCancel = new OO.ui.ButtonWidget( {
				label: mw.message( 'cancel-fileannotation' ).text(),
				icon: 'cancel',
				flags: [ 'safe' ]
			} ),
			annotationButtons = new OO.ui.ButtonGroupWidget( {
				items: [ annotationCancel, annotationSave ]
			} ),
			buttonsField = new OO.ui.FieldLayout( annotationButtons, {
				align: 'right'
			} );

		if ( text ) {
			annotationText.setValue( text );
		}

		$annotationEditor.append(
			annotationText.$element,
			buttonsField.$element
		);

		$container.append( $annotationEditor );

		$annotationEditor.css( {
			left: '-' + ( $annotationEditor.outerWidth() + 15 ) + 'px'
		} );

		annotationCancel.once( 'click', function () {
			$annotationEditor.remove();
			deferred.reject();
		} );

		annotationSave.once( 'click', function () {
			deferred.resolve( annotationText.getValue() );
		} );

		return deferred.promise();
	}

	/**
	 * Render an annotation, and the edit interface.
	 *
	 * @param {number} i Which number this annotation is in the list.
	 * @param {Object} annotation
	 * @param {string} annotation.parsed The HTML value of the annotation.
	 * @param {string} annotation.content The wikitext of the annotation.
	 * @param {number} annotation.x The X coordinate for the annotation's location on the image.
	 * @param {number} annotation.y The Y coordinate.
	 * @param {number} annotation.width The width of the annotation box.
	 * @param {number} annotation.height The height of the annotation box.
	 * @param {Object} imageInfo See MW API documentation.
	 * @param {number} adjustRatioX By how much the thumbnail of the image is distorted from the full image size.
	 * @param {number} adjustRatioY Same as above, but for the Y axis.
	 * @return {jQuery} The annotation box to be added to the container.
	 */
	function renderAnnotation( i, annotation, imageInfo, adjustRatioX, adjustRatioY ) {
		var $annotation = $( '<div>' )
				.addClass( 'file-annotation' )
				.append( annotation.parsed ),
			adjustedX = annotation.x * adjustRatioX,
			adjustedY = annotation.y * adjustRatioY,
			adjustedWidth = annotation.width * adjustRatioX,
			adjustedHeight = annotation.height * adjustRatioY,

			editButton = new OO.ui.ButtonWidget( {
				label: mw.message( 'edit-fileannotation' ).text(),
				flags: [ 'progressive' ]
			} ),

			deleteButton = new OO.ui.ButtonWidget( {
				label: mw.message( 'delete-fileannotation' ).text(),
				flags: [ 'destructive' ]
			} ),

			modifyButtons = new OO.ui.ButtonGroupWidget( {
				items: [ editButton, deleteButton ]
			} ),

			buttonsField = new OO.ui.FieldLayout( modifyButtons, {
				classes: [ 'annotation-edit-buttons' ],
				align: 'right'
			} ),

			$annotationBox = $( '<div>' )
				.addClass( 'annotation-box' )
				.css( {
					top: adjustedY,
					left: adjustedX,
					width: adjustedWidth,
					height: adjustedHeight
				} ),
			$annotationContain = $( '<div>' )
				.addClass( 'annotation-container' );

		editButton.on( 'click', function () {
			var currentX = $annotationBox.css( 'left' ),
				currentY = $annotationBox.css( 'top' ),
				currentWidth = $annotationBox.css( 'width' ),
				currentHeight = $annotationBox.css( 'height' );

			// Create edit interface and link things up
			$annotationBox.addClass( 'editing-annotation' );
			$annotationsContainer.addClass( 'editing-annotations' );

			$annotationBox.draggable( {
				containment: 'parent'
			} );

			$annotationBox.resizable( {
				containment: 'parent'
			} );

			createAnnotationTextEditor( $annotationContain, annotation.text ).then( function ( newText ) {
				var newY = parseInt( $annotationBox.css( 'top' ), 10 ),
					newX = parseInt( $annotationBox.css( 'left' ), 10 ),
					newWidth = parseInt( $annotationBox.css( 'width' ), 10 ),
					newHeight = parseInt( $annotationBox.css( 'height' ), 10 );

				getAnnotationsJSON( annotationsTitle ).then( function ( annotations ) {
					annotations.annotations[ i ].content = newText;
					annotations.annotations[ i ].x = newX / adjustRatioX;
					annotations.annotations[ i ].y = newY / adjustRatioY;
					annotations.annotations[ i ].width = newWidth / adjustRatioX;
					annotations.annotations[ i ].height = newHeight / adjustRatioY;

					saveUpdatedAnnotations( annotations, annotationsTitle, 'Edited annotation on file page. New text: "' + newText + '"' ).then( function () {
						// Close edit interface, make the annotation official.
						annotationsCache = undefined;
						getAndRenderAnnotations( pageTitle, $annotationsContainer, $mainImage );
					} );
				} );
			}, function () {
				$annotationBox.removeClass( 'editing-annotation' );
				$annotationBox.resizable( 'destroy' );
				$annotationBox.draggable( 'destroy' );

				$annotationBox.css( {
					top: currentY,
					left: currentX,
					height: currentHeight,
					width: currentWidth
				} );
			} );
		} );

		deleteButton.on( 'click', function () {
			// Delete the annotation and refresh.
			getAnnotationsJSON( annotationsTitle ).then( function ( annotations ) {
				annotations.annotations.splice( i, 1 );
				saveUpdatedAnnotations( annotations, annotationsTitle, 'Deleted annotation on file page.' ).then( function () {
					// Close edit interface, make the annotation official.
					annotationsCache = undefined;
					getAndRenderAnnotations( pageTitle, $annotationsContainer, $mainImage );
				} );
			} );
		} );

		$annotationContain.append(
			$annotation,
			buttonsField.$element
		);

		$annotationBox.append( $annotationContain );
		$annotationContain.css( {
			top: adjustedHeight - 10,
			left: adjustedWidth - 10
		} );

		return $annotationBox;
	}

	function getAndRenderAnnotations( imageTitle, $container, $img ) {
		getAnnotationsHTML( imageTitle )
			.then( function ( data ) {
				var i,
					pageId = data.query.pageids[ 0 ],
					page = data.query.pages[ pageId ],
					imageInfo = page.imageinfo[ 0 ],
					annotations = page.fileannotations[ 0 ],
					fullw = imageInfo.width,
					fullh = imageInfo.height,
					imgw = $img.width(),
					imgh = $img.height(),
					adjustRatioX = imgw / fullw,
					adjustRatioY = imgh / fullh;

				// Clear any existing annotations so we start fresh.
				$container.empty();

				for ( i = 0; i < annotations.length; i++ ) {
					$container.append(
						renderAnnotation( i, annotations[ i ], imageInfo, adjustRatioX, adjustRatioY )
					);
				}
			} );
	}

	if ( isFilePage ) {
		$mainImage = $fileLink.find( 'img' );

		$annotationInfo = $( '<div>' )
			.addClass( 'fileannotation-info' )
			.append(
				$( '<p>' ).text( mw.message( 'file-has-annotations' ).text() )
			);

		$fileLink.after( $annotationInfo );

		$annotationsContainer = $( '<div>' )
			.addClass( 'annotation-wrapper' );

		offset = $mainImage.offset();

		$annotationsContainer.css( {
			top: offset.top,
			left: offset.left,
			width: $mainImage.width(),
			height: $mainImage.height()
		} );

		$( 'body' ).append( $annotationsContainer );

		getAndRenderAnnotations( pageTitle, $annotationsContainer, $mainImage );

		getAnnotationsHTML( pageTitle )
			.then( function ( data ) {
				var pageId = data.query.pageids[ 0 ],
					page = data.query.pages[ pageId ],
					imageInfo = page.imageinfo[ 0 ],
					fullw = imageInfo.width,
					fullh = imageInfo.height,
					imgw = $mainImage.width(),
					imgh = $mainImage.height(),
					adjustRatioX = imgw / fullw,
					adjustRatioY = imgh / fullh;

				// Make it possible to create new annotations graphically.
				createButton = new OO.ui.ButtonWidget( {
					label: mw.message( 'fileannotation-create' ).text(),
					icon: 'add',
					flags: [ 'constructive' ]
				} );

				createButton.on( 'click', function () {
					if ( $annotationsContainer.hasClass( 'click-to-create' ) ) {
						// Don't turn it on twice!
						return;
					}

					// Turn on click-to-initiate...
					$annotationsContainer
						.addClass( 'click-to-create' );

					$annotationsContainer
						.one( 'click', function ( e ) {
							// Add outline and edit interface
							var x = e.offsetX,
								y = e.offsetY,
								// We want the annotation to default to at least 40 pixels,
								// or 1/20th of the size of the image, unless the image is less than 40
								// pixels in which case we'll just select the whole thing.
								defaultHeight = Math.min( Math.max( 40, fullh / 20 ), fullh ),
								defaultWidth = Math.min( Math.max( 40, fullw / 20 ), fullw ),
								adjustedDefaultDim = Math.min(
									defaultHeight * adjustRatioY,
									defaultWidth * adjustRatioX
								),

								$newBox = $( '<div>' )
									.addClass( 'new-annotation' )
									.css( {
										top: y,
										left: x,
										width: adjustedDefaultDim,
										height: adjustedDefaultDim
									} );

							$newBox.draggable( {
								containment: 'parent'
							} );
							$newBox.resizable( {
								containment: 'parent'
							} );

							$annotationsContainer.append( $newBox );

							$annotationsContainer.removeClass( 'click-to-create' );

							createAnnotationTextEditor( $newBox )
								.fail( function () {
									$newBox.remove();
								} ).done( function ( newText ) {
									var newY = parseInt( $newBox.css( 'top' ), 10 ),
										newX = parseInt( $newBox.css( 'left' ), 10 ),
										newWidth = parseInt( $newBox.css( 'width' ), 10 ),
										newHeight = parseInt( $newBox.css( 'height' ), 10 );

									getAnnotationsJSON( annotationsTitle ).then( function ( annotations ) {
										annotations.annotations.push( {
											content: newText,
											x: newX / adjustRatioX,
											y: newY / adjustRatioY,
											width: newWidth / adjustRatioX,
											height: newHeight / adjustRatioY
										} );

										return saveUpdatedAnnotations(
											annotations, annotationsTitle,
											'Added a file annotation from the file page, text: "' + newText + '"'
										);
									} ).then( function () {
										// Close interface, make the annotation official.
										annotationsCache = undefined;
										getAndRenderAnnotations( pageTitle, $annotationsContainer, $mainImage );
									} );
								} );
						} );
				} );

				$annotationInfo.append( createButton.$element );
			} );
	}
}( jQuery, mediaWiki ) );
