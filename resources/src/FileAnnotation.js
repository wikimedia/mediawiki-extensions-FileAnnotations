( function ( mw, $, OO ) {
	/**
	 * Single annotation's interface.
	 *
	 * @class mw.FileAnnotation
	 * @mixins OO.EventEmitter
	 * @constructor
	 * @param {Object} config
	 * @cfg {Object} annotation Information including x, y, width, height, index, etc.
	 * @cfg {Object} file Information including title, sizes, etc.
	 * @cfg {Object} display Information about the current display of the file - height, width.
	 * @cfg {jQuery} $container If this is a new annotation, this is where the edit interface is put.
	 * @cfg {boolean} editing Whether editing is enabled.
	 */
	function FileAnnotation( config ) {
		OO.EventEmitter.call( this );

		this.api = config.api;

		this.index = config.annotation.index;

		this.x = config.annotation.x;
		this.y = config.annotation.y;
		this.width = config.annotation.width;
		this.height = config.annotation.height;

		this.text = config.annotation.text;
		this.parsed = config.annotation.parsed;

		this.fileTitle = config.file.title;
		this.annotationsTitle = mw.Title.newFromText( 'File annotations:' + this.fileTitle.getMain() );
		this.fileWidth = config.file.width;
		this.fileHeight = config.file.height;

		this.displayWidth = config.display.width;
		this.displayHeight = config.display.height;

		this.adjustRatioX = this.displayWidth / this.fileWidth;
		this.adjustRatioY = this.displayHeight / this.fileHeight;

		this.adjustedX = this.x * this.adjustRatioX;
		this.adjustedY = this.y * this.adjustRatioY;
		this.adjustedWidth = this.width * this.adjustRatioX;
		this.adjustedHeight = this.height * this.adjustRatioY;

		this.editing = config.editing;

		if ( this.text !== undefined && this.parsed !== undefined ) {
			this.$annotation = $( '<div>' )
				.addClass( 'file-annotation' )
				.append( this.parsed );

			this.$annotation.find( '.commons-category-annotation .commons-see-more' )
				.msg( 'fileannotations-commons-see-more' );

			this.$contain = $( '<div>' )
				.addClass( 'annotation-container' );

			this.$box = $( '<div>' )
				.addClass( 'annotation-box' )
				.append( this.$contain )
				.css( {
					top: this.adjustedY,
					left: this.adjustedX,
					width: this.adjustedWidth,
					height: this.adjustedHeight
				} );

			this.$contain.css( {
				top: this.adjustedHeight - 10,
				left: this.adjustedWidth - 10
			} );

			this.$contain.append( this.$annotation );

			if ( config.editing ) {
				this.addEditInterface();
			}
		} else {
			// New annotation. Create the edit interface immediately.
			this.$container = config.$container;
			this.createEditor();
		}
	}

	OO.mixinClass( FileAnnotation, OO.EventEmitter );

	/**
	 * Adds an "edit" and "delete" button to the annotation for inline
	 * edits.
	 */
	FileAnnotation.prototype.addEditInterface = function () {
		var annotation = this;

		this.editButton = new OO.ui.ButtonWidget( {
			label: mw.message( 'fileannotations-edit' ).text(),
			flags: [ 'progressive' ]
		} );

		this.deleteButton = new OO.ui.ButtonWidget( {
			label: mw.message( 'fileannotations-delete' ).text(),
			flags: [ 'destructive' ]
		} );

		this.modifyButtons = new OO.ui.ButtonGroupWidget( {
			items: [ this.editButton, this.deleteButton ]
		} );

		this.buttonsField = new OO.ui.FieldLayout( this.modifyButtons, {
			classes: [ 'annotation-edit-buttons' ],
			align: 'right'
		} );

		this.editButton.on( 'click', function () {
			annotation.createEditor();
		} );

		this.deleteButton.on( 'click', function () {
			annotation.deleteAnnotation().then( function () {
				annotation.emit( 'refresh-all' );
			} );
		} );

		this.$contain.append( this.buttonsField.$element );
	};

	/**
	 * Creates the annotation editor interface.
	 */
	FileAnnotation.prototype.createEditor = function () {
		var annotation = this;

		this.emit( 'start-edit' );

		this.editInterface = new mw.FileAnnotationEditor( {
			annotation: {
				text: this.text,
				x: this.x,
				y: this.y,
				width: this.width,
				height: this.height
			},

			$existing: this.$box,
			$container: this.$container
		} );

		this.editInterface.on( 'save', function ( newAnn ) {
			// Need to adapt some of the values, because the editor doesn't know
			// about the original picture size.
			newAnn.x = newAnn.x / annotation.adjustRatioX;
			newAnn.y = newAnn.y / annotation.adjustRatioY;
			newAnn.width = newAnn.width / annotation.adjustRatioX;
			newAnn.height = newAnn.height / annotation.adjustRatioY;

			annotation.saveChanges( newAnn ).then( function () {
				annotation.emit( 'refresh-all' );
			} );
		} );

		this.editInterface.on( 'cancel-edit', function () {
			annotation.emit( 'cancel-edit' );
		} );
	};

	/**
	 * Get JSON data for the annotations on the page, suitable for editing.
	 *
	 * @return {jQuery.Promise}
	 */
	FileAnnotation.prototype.getPageJSON = function () {
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
	FileAnnotation.prototype.saveText = function ( annotations, summary ) {
		return this.api.postWithToken( 'csrf', {
			action: 'edit',
			title: this.annotationsTitle.getPrefixedText(),
			text: JSON.stringify( annotations ),
			summary: summary
		} );
	};

	FileAnnotation.prototype.saveChanges = function ( newAnn ) {
		var annotation = this;

		return this.getPageJSON().then( function ( annotations ) {
			var summary,
				newAnnotation = {
					content: newAnn.text,
					x: newAnn.x,
					y: newAnn.y,
					width: newAnn.width,
					height: newAnn.height
				};

			if ( annotation.index ) {
				annotations.annotations[ annotation.index ] = newAnnotation;
				summary = 'Edited annotation on file page. New text: "' + newAnn.text + '"';
			} else {
				annotations.annotations.push( newAnnotation );
				summary = 'Added annotation on file page. Text: "' + newAnn.text + '"';
			}

			return annotation.saveText(
				annotations,
				summary
			);
		} );
	};

	/**
	 * Deletes the annotation and saves.
	 */
	FileAnnotation.prototype.deleteAnnotation = function () {
		var annotation = this;

		return this.getPageJSON().then( function ( annotations ) {
			annotations.annotations.splice( annotation.index, 1 );

			return annotation.saveText(
				annotations,
				'Deleted annotation on file page.'
			);
		} );
	};

	mw.FileAnnotation = FileAnnotation;
}( mediaWiki, jQuery, OO ) );
