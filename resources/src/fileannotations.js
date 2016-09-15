( function ( $, mw, OO ) {
	var pageAnnotator,
		pageTitle = mw.Title.newFromText( mw.config.get( 'wgPageName' ) ),
		isFilePage = pageTitle.getNamespaceId() === 6,
		$fileLink = $( '#file > a' );

	/**
	 * Class for rendering, editing, creating and deleting annotations on a file.
	 *
	 * @class mw.FileAnnotator
	 * @constructor
	 * @param {Object} config
	 * @cfg {jQuery} $container The link that encloses the image.
	 * @cfg {mw.Title} title Title of the file.
	 * @cfg {boolean} [editing] Whether to enable editing annotations.
	 */
	function FileAnnotator( config ) {
		var offset, $annotationInfo, createButton,
			annotator = this;

		this.api = new mw.Api();

		this.$fileLink = config.$container;
		this.fileTitle = config.title;
		this.$img = this.$fileLink.find( 'img' );
		this.editing = !!config.editing;

		$annotationInfo = $( '<div>' )
			.addClass( 'fileannotation-info' );

		this.$fileLink.after( $annotationInfo );

		this.$container = $( '<div>' )
			.addClass( 'annotation-wrapper' );

		offset = this.$img.offset();

		this.$container.css( {
			top: offset.top,
			left: offset.left,
			width: this.$img.width(),
			height: this.$img.height()
		} );

		$( 'body' ).append( this.$container );

		this.annotationsTitle = mw.Title.newFromText( 'File_Annotations:' + this.fileTitle.getMain() );

		this.getAndRenderAnnotations().then( function () {
			var $body = $( 'body' );

			if ( $body.hasClass( 'mw-mobile-mode' ) ) {
				annotator.whenInView( function () {
					annotator.flashAnnotations();
				} );
			} else {
				annotator.displayAnnotationsUntilHover();
			}
		} );

		if ( this.editing ) {
			this.getAnnotationsHTML().then( function ( data ) {
				var pageId = data.query.pageids[ 0 ],
					page = data.query.pages[ pageId ],
					imageInfo = page.imageinfo[ 0 ],
					fullw = imageInfo.width,
					fullh = imageInfo.height,
					imgw = annotator.$img.width(),
					imgh = annotator.$img.height(),
					adjustRatioX = imgw / fullw,
					adjustRatioY = imgh / fullh;

				// Make it possible to create new annotations graphically.
				createButton = new OO.ui.ButtonWidget( {
					label: mw.message( 'fileannotation-create' ).text(),
					icon: 'add',
					flags: [ 'constructive' ]
				} );

				createButton.on( 'click', function () {
					if ( annotator.$container.hasClass( 'click-to-create' ) ) {
						// Don't turn it on twice!
						return;
					}

					// Turn on click-to-initiate...
					annotator.$container
						.addClass( 'click-to-create' );

					annotator.$container
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
								);

							annotator.$container.removeClass( 'click-to-create' );

							annotator.createAnnotationEditor( x, y, adjustedDefaultDim, adjustedDefaultDim )
								.then( function ( newX, newY, newWidth, newHeight, newText ) {
									annotator.getAnnotationsJSON().then( function ( annotations ) {
										annotations.annotations.push( {
											content: newText,
											x: newX / adjustRatioX,
											y: newY / adjustRatioY,
											width: newWidth / adjustRatioX,
											height: newHeight / adjustRatioY
										} );

										return annotator.saveAnnotations(
											annotations,
											'Added a file annotation from the file page, text: "' + newText + '"'
										);
									} ).then( function () {
										// Close interface, make the annotation official.
										annotator.annotationsCache = undefined;
										annotator.getAndRenderAnnotations();
									} );
								} );

							// Dont want to click and open the image
							e.preventDefault();
						} );
				} );

				$annotationInfo.append( createButton.$element );
			} );
		}
	}

	/**
	 * Get JSON data for the annotations on the page, suitable for editing.
	 *
	 * @return {jQuery.Promise}
	 */
	FileAnnotator.prototype.getAnnotationsJSON = function () {
		return this.api.get( {
			action: 'query',
			prop: 'revisions',
			rvprop: 'content',
			indexpageids: true,
			titles: this.annotationsTitle.getPrefixedDb()
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
	};

	/**
	 * Save the annotations to the server.
	 *
	 * @param {Object} annotations A valid JavaScript object adhering to the annotations schema.
	 * @param {string} summary The edit summary.
	 * @return {jQuery.Promise}
	 */
	FileAnnotator.prototype.saveAnnotations = function ( annotations, summary ) {
		return this.api.postWithToken( 'csrf', {
			action: 'edit',
			title: this.annotationsTitle.getPrefixedDb(),
			text: JSON.stringify( annotations ),
			summary: summary
		} );
	};

	/**
	 * Get the HTML version of the file annotations, so we can show them on
	 * the page.
	 *
	 * @return {jQuery.Promise}
	 */
	FileAnnotator.prototype.getAnnotationsHTML = function () {
		if ( this.annotationsCache === undefined ) {
			this.annotationsCache = this.api.get( {
				action: 'query',
				indexpageids: true,
				prop: [ 'fileannotations', 'imageinfo' ],
				titles: this.fileTitle.getPrefixedDb(),
				faparse: true,
				iiprop: 'size'
			} ).then( function ( data ) {
				if ( data.error ) {
					return $.Deferred().reject( data.error );
				}

				return data;
			} );
		}

		return this.annotationsCache;
	};

	/**
	 * Creates an interface for editing an annotation.
	 *
	 * @param {jQuery} $container Where to put the editor interface.
	 * @param {string} text The wikitext of the annotation.
	 * @return {jQuery.Promise} Resolved with the new text if annotation is saved, rejected if annotation is discarded.
	 */
	FileAnnotator.prototype.createAnnotationTextEditor = function ( $container, text ) {
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
	};

	/**
	 * Create an editing interface for an annotation, including text editor
	 * and graphical location/size editor.
	 *
	 * @param {number} x
	 * @param {number} y
	 * @param {number} width
	 * @param {number} height
	 * @param {string} [text] If the annotation already exists, this is the wikitext.
	 * @param {jQuery} [$existing] If the annotation already exists, this is the rendered box.
	 * @return {jQuery.Promise}
	 */
	FileAnnotator.prototype.createAnnotationEditor = function ( x, y, width, height, text, $existing ) {
		var $box, $contain,
			annotator = this;

		this.$container.addClass( 'editing-annotations' );

		if ( $existing ) {
			$box = $existing;
			$box.addClass( 'editing-annotation' );
			$contain = $box.find( '.annotation-container' );
		} else {
			$box = $( '<div>' )
				.addClass( 'new-annotation' )
				.css( {
					top: y,
					left: x,
					width: width,
					height: height
				} );

			this.$container.append( $box );

			// For a new annotation, the box is the container.
			$contain = $box;
		}

		$box.draggable( {
			containment: 'parent'
		} );

		$box.resizable( {
			containment: 'parent'
		} );

		return annotator.createAnnotationTextEditor( $contain, text ).then( function ( newText ) {
			var newY = parseInt( $box.css( 'top' ), 10 ),
				newX = parseInt( $box.css( 'left' ), 10 ),
				newWidth = parseInt( $box.css( 'width' ), 10 ),
				newHeight = parseInt( $box.css( 'height' ), 10 );

			return $.Deferred().resolve( newX, newY, newWidth, newHeight, newText );
		}, function () {
			annotator.$container.removeClass( 'editing-annotations' );

			if ( $existing ) {
				$box.removeClass( 'editing-annotation' );
				$box.resizable( 'destroy' );
				$box.draggable( 'destroy' );

				$box.css( {
					top: y,
					left: x,
					height: height,
					width: width
				} );
			} else {
				$box.remove();
			}
		} );
	};

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
	FileAnnotator.prototype.renderAnnotation = function ( i, annotation, imageInfo, adjustRatioX, adjustRatioY ) {
		var editButton, deleteButton, modifyButtons, buttonsField,
			annotator = this,
			$annotation = $( '<div>' )
				.addClass( 'file-annotation' )
				.append( annotation.parsed ),
			adjustedX = annotation.x * adjustRatioX,
			adjustedY = annotation.y * adjustRatioY,
			adjustedWidth = annotation.width * adjustRatioX,
			adjustedHeight = annotation.height * adjustRatioY,

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

		$annotationContain.append(
			$annotation
		);

		$( '.commons-category-annotation .commons-see-more' )
			.msg( 'fileannotations-commons-see-more' );

		if ( this.editing ) {
			editButton = new OO.ui.ButtonWidget( {
				label: mw.message( 'edit-fileannotation' ).text(),
				flags: [ 'progressive' ]
			} );

			deleteButton = new OO.ui.ButtonWidget( {
				label: mw.message( 'delete-fileannotation' ).text(),
				flags: [ 'destructive' ]
			} );

			modifyButtons = new OO.ui.ButtonGroupWidget( {
				items: [ editButton, deleteButton ]
			} );

			buttonsField = new OO.ui.FieldLayout( modifyButtons, {
				classes: [ 'annotation-edit-buttons' ],
				align: 'right'
			} );

			editButton.on( 'click', function () {
				var currentX = $annotationBox.css( 'left' ),
					currentY = $annotationBox.css( 'top' ),
					currentWidth = $annotationBox.css( 'width' ),
					currentHeight = $annotationBox.css( 'height' );

				annotator.createAnnotationEditor(
					currentX,
					currentY,
					currentWidth,
					currentHeight,
					annotation.text,
					$annotationBox
				).then( function ( newX, newY, newWidth, newHeight, newText ) {
					annotator.getAnnotationsJSON().then( function ( annotations ) {
						annotations.annotations[ i ].content = newText;
						annotations.annotations[ i ].x = newX / adjustRatioX;
						annotations.annotations[ i ].y = newY / adjustRatioY;
						annotations.annotations[ i ].width = newWidth / adjustRatioX;
						annotations.annotations[ i ].height = newHeight / adjustRatioY;

						annotator.saveAnnotations(
							annotations,
							'Edited annotation on file page. New text: "' + newText + '"'
						).then( function () {
							// Close edit interface, make the annotation official.
							annotator.annotationsCache = undefined;
							annotator.getAndRenderAnnotations();
						} );
					} );
				} );
			} );

			deleteButton.on( 'click', function () {
				// Delete the annotation and refresh.
				annotator.getAnnotationsJSON().then( function ( annotations ) {
					annotations.annotations.splice( i, 1 );
					annotator.saveAnnotations(
						annotations,
						'Deleted annotation on file page.'
					).then( function () {
						// Close edit interface, make the annotation official.
						annotator.annotationsCache = undefined;
						annotator.getAndRenderAnnotations();
					} );
				} );
			} );

			$annotationContain.append(
				buttonsField.$element
			);
		}

		$annotationBox.append( $annotationContain );
		$annotationContain.css( {
			top: adjustedHeight - 10,
			left: adjustedWidth - 10
		} );

		return $annotationBox;
	};

	/**
	 * Get the annotations, and render them on the image.
	 *
	 * @return {jQuery.Promise}
	 */
	FileAnnotator.prototype.getAndRenderAnnotations = function () {
		var annotator = this;

		return this.getAnnotationsHTML( this.fileTitle )
			.then( function ( data ) {
				var i,
					pageId = data.query.pageids[ 0 ],
					page = data.query.pages[ pageId ],
					imageInfo = page.imageinfo[ 0 ],
					annotations = page.fileannotations[ 0 ],
					fullw = imageInfo.width,
					fullh = imageInfo.height,
					imgw = annotator.$img.width(),
					imgh = annotator.$img.height(),
					adjustRatioX = imgw / fullw,
					adjustRatioY = imgh / fullh;

				// Clear any existing annotations so we start fresh.
				annotator.$container.empty();

				annotator.$container.append(
					$( '<a>' )
						.addClass( 'file-link-backup' )
						.attr( 'href', annotator.$fileLink.attr( 'href' ) )
				);

				for ( i = 0; i < annotations.length; i++ ) {
					annotator.$container.append(
						annotator.renderAnnotation( i, annotations[ i ], imageInfo, adjustRatioX, adjustRatioY )
					);
				}

				return $.Deferred().resolve();
			} );
	};

	FileAnnotator.prototype.displayAnnotationsUntilHover = function () {
		var $container = this.$container;

		$container.addClass( 'force-show-annotations' );

		$container.one( 'mouseenter', function () {
			// Once the user hovers over the image once, let the annotations disappear
			$container.removeClass( 'force-show-annotations' );
		} );
	};

	FileAnnotator.prototype.flashAnnotations = function () {
		var $container = this.$container;

		$container.addClass( 'force-show-annotations' );

		setTimeout( function () {
			// Let the annotations disappear after five seconds.
			$container.removeClass( 'force-show-annotations' );
		}, 5000 );
	};

	if ( isFilePage ) {
		// This is a file page, so just dump the main image into the
		// annotator class, with editing and a notification below the image.
		pageAnnotator = new FileAnnotator( {
			$container: $fileLink,
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
					$img = $link.find( 'img' );

				thumbAnnotator = new FileAnnotator( {
					$container: $link,
					title: mw.Title.newFromImg( $img ),
					editing: false
				} );
			} );
		} );
	}

	FileAnnotator.prototype.whenInView = function ( cb ) {
		var fired = false,
			annotator = this;

		if ( this.isInView() ) {
			cb();
			fired = true;
		} else {
			$( 'body' ).scroll( OO.ui.debounce( function () {
				if ( annotator.isInView() && !fired ) {
					cb();
					fired = true;
				}
			}, 200 ) );
		}
	};

	FileAnnotator.prototype.isInView = function () {
		var $win = $( window ),
			windowTop = $win.scrollTop(),
			windowBottom = windowTop + $win.height(),
			containerTop = this.$container.offset().top,
			containerBottom = containerTop + this.$container.height();

		return ( ( containerBottom <= windowBottom ) && ( containerTop >= windowTop ) );
	};

	mw.FileAnnotator = FileAnnotator;
}( jQuery, mediaWiki, OO ) );
