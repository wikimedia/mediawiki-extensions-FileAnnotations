( function ( $, mw, OO ) {
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
		var $annotationInfo, createButton,
			annotator = this;

		this.api = new mw.Api();

		this.editInterfaces = 0;
		this.annotations = [];

		this.$fileLink = config.$infoContainer;
		this.fileTitle = config.title;
		this.$img = this.$fileLink.find( 'img' );
		this.editing = !!config.editing;

		$annotationInfo = $( '<div>' )
			.addClass( 'fileannotation-info' );

		this.$fileLink.after( $annotationInfo );

		this.$container = $( '<div>' )
			.addClass( 'annotation-wrapper' );

		this.$container.css( {
			top: 0,
			left: 0,
			width: this.$img.width(),
			height: this.$img.height()
		} );

		config.$container.css( {
			position: 'relative'
		} );

		config.$container.append( this.$container );

		this.annotationsTitle = mw.Title.newFromText( 'File annotations:' + this.fileTitle.getMain() );

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
				var page = data.query.pages[ 0 ],
					imageInfo = page.imageinfo[ 0 ],
					fullw = imageInfo.width,
					fullh = imageInfo.height,
					imgw = annotator.$img.width(),
					imgh = annotator.$img.height(),
					adjustRatioX = imgw / fullw,
					adjustRatioY = imgh / fullh;

				// Make it possible to create new annotations graphically.
				createButton = new OO.ui.ButtonWidget( {
					label: mw.message( 'fileannotations-create' ).text(),
					icon: 'add',
					flags: [ 'progressive' ]
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
								),
								newAnnotation = new mw.FileAnnotation( {
									api: annotator.api,
									$container: annotator.$container,

									annotation: {
										x: x,
										y: y,
										width: adjustedDefaultDim,
										height: adjustedDefaultDim
									},

									file: {
										title: annotator.fileTitle,
										width: fullw,
										height: fullh
									},

									display: {
										width: imgw,
										height: imgh
									}
								} );

							newAnnotation.on( 'refresh-all', function () {
								annotator.annotationsCache = undefined;
								annotator.getAndRenderAnnotations();
							} );

							newAnnotation.on( 'start-edit', function () {
								annotator.editInterfaces++;
								annotator.$container.addClass( 'editing-annotations' );
							} );

							newAnnotation.on( 'cancel-edit', function () {
								if ( --annotator.editInterfaces === 0 ) {
									annotator.$container.addClass( 'editing-annotations' );
								}
							} );

							annotator.$container.removeClass( 'click-to-create' );

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
			formatversion: 2,
			format: 'json',
			titles: this.annotationsTitle.getPrefixedText()
		} ).then( function ( data ) {
			var rv, text, annotations,
				pages = data.query.pages,
				page = pages[ 0 ],
				revisions = page.revisions;

			if ( revisions ) {
				rv = revisions[ 0 ];
				text = rv.content;
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
			title: this.annotationsTitle.getPrefixedText(),
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
				formatversion: 2,
				format: 'json',
				prop: [ 'fileannotations', 'imageinfo' ],
				titles: this.fileTitle.getPrefixedText(),
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
	 * Render an annotation, and the edit interface.
	 *
	 * @param {Object} annotationInfo
	 * @param {string} annotationInfo.parsed The HTML value of the annotation.
	 * @param {string} annotationInfo.content The wikitext of the annotation.
	 * @param {number} annotationInfo.x The X coordinate for the annotation's location on the image.
	 * @param {number} annotationInfo.y The Y coordinate.
	 * @param {number} annotationInfo.width The width of the annotation box.
	 * @param {number} annotationInfo.height The height of the annotation box.
	 * @param {number} annotationInfo.index Which number this annotation is in the list.
	 * @param {Object} imageInfo See MW API documentation.
	 * @return {jQuery} The annotation box to be added to the container.
	 */
	FileAnnotator.prototype.renderAnnotation = function ( annotationInfo, imageInfo ) {
		var annotator = this,
			annotation = new mw.FileAnnotation( {
				editing: this.editing,
				api: this.api,
				annotation: annotationInfo,
				file: {
					title: this.fileTitle,
					width: imageInfo.width,
					height: imageInfo.height
				},
				display: {
					width: this.$img.width(),
					height: this.$img.height()
				}
			} );

		annotation.on( 'refresh-all', function () {
			annotator.annotationsCache = undefined;
			annotator.getAndRenderAnnotations();
		} );

		annotation.on( 'start-edit', function () {
			annotator.editInterfaces++;
			annotator.$container.addClass( 'editing-annotations' );
		} );

		annotation.on( 'cancel-edit', function () {
			if ( --annotator.editInterfaces === 0 ) {
				annotator.$container.addClass( 'editing-annotations' );
			}
		} );

		this.annotations.push( annotation );

		return annotation.$box;
	};

	/**
	 * Get the annotations, and render them on the image.
	 *
	 * @return {jQuery.Promise}
	 */
	FileAnnotator.prototype.getAndRenderAnnotations = function () {
		var annotator = this;

		this.annotations = [];

		return this.getAnnotationsHTML( this.fileTitle )
			.then( function ( data ) {
				var i,
					page = data.query.pages[ 0 ],
					imageInfo = page.imageinfo[ 0 ],
					annotations = page.fileannotations[ 0 ];

				// Clear any existing annotations so we start fresh.
				annotator.$container.empty();

				annotator.$container.append(
					$( '<a>' )
						.addClass( 'file-link-backup' )
						.attr( 'href', annotator.$fileLink.attr( 'href' ) )
				);

				for ( i = 0; i < annotations.length; i++ ) {
					annotations[ i ].index = i;
					annotator.$container.append(
						annotator.renderAnnotation( annotations[ i ], imageInfo )
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
