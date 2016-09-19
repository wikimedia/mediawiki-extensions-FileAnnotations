( function ( mw, $, OO ) {
	/**
	 * Editing interface for a single annotation.
	 *
	 * @class mw.FileAnnotationEditor
	 * @mixins OO.EventEmitter
	 * @constructor
	 * @param {Object} config
	 * @cfg {Object} annotation Including x, y, width, height, and text.
	 * @cfg {jQuery} $existing The existing annotation box, if any.
	 * @cfg {jQuery} $container If this is a new annotation, the container to put it in.
	 */
	function FileAnnotationEditor( config ) {
		var $box, $contain,
			editor = this;

		OO.EventEmitter.call( this );

		if ( config.$existing ) {
			$box = config.$existing;
			$box.addClass( 'editing-annotation' );
			$contain = $box.find( '.annotation-container' );
		} else {
			$box = $( '<div>' )
				.addClass( 'new-annotation' )
				.css( {
					top: config.annotation.y,
					left: config.annotation.x,
					width: config.annotation.width,
					height: config.annotation.height
				} );

			// For a new annotation, the box is the container.
			$contain = $box;

			config.$container.append( $box );
		}

		this.$box = $box;
		this.$contain = $contain;

		$box.draggable( {
			containment: 'parent'
		} );

		$box.resizable( {
			containment: 'parent'
		} );

		this.createTextEditor( $contain, config.annotation.text ).then( function ( newText ) {
			var newY = parseInt( $box.css( 'top' ), 10 ),
				newX = parseInt( $box.css( 'left' ), 10 ),
				newWidth = parseInt( $box.css( 'width' ), 10 ),
				newHeight = parseInt( $box.css( 'height' ), 10 );

			editor.emit( 'save', {
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight,
				text: newText
			} );
		}, function () {
			editor.emit( 'cancel-edit' );

			if ( config.$existing ) {
				$box.removeClass( 'editing-annotation' );
				$box.resizable( 'destroy' );
				$box.draggable( 'destroy' );

				$box.css( {
					top: config.y,
					left: config.x,
					height: config.height,
					width: config.width
				} );
			} else {
				$box.remove();
			}
		} );
	}

	OO.mixinClass( FileAnnotationEditor, OO.EventEmitter );

	/**
	 * Creates an interface for editing an annotation.
	 *
	 * @param {jQuery} $container Where to put the editor interface.
	 * @param {string} text The wikitext of the annotation.
	 * @return {jQuery.Promise} Resolved with the new text if annotation is saved, rejected if annotation is discarded.
	 */
	FileAnnotationEditor.prototype.createTextEditor = function ( $container, text ) {
		var deferred = $.Deferred(),
			editor = this;

		this.$editor = $( '<div>' )
			.addClass( 'annotation-editor' );

		this.textWidget = new OO.ui.TextInputWidget( {
			multiline: true
		} );

		this.saveButton = new OO.ui.ButtonWidget( {
			label: mw.message( 'fileannotations-save' ).text(),
			icon: 'check',
			flags: [ 'constructive', 'primary' ]
		} );

		this.cancelButton = new OO.ui.ButtonWidget( {
			label: mw.message( 'fileannotations-cancel' ).text(),
			icon: 'cancel',
			flags: [ 'safe' ]
		} );

		this.buttons = new OO.ui.ButtonGroupWidget( {
			items: [ this.cancelButton, this.saveButton ]
		} );

		this.buttonsField = new OO.ui.FieldLayout( this.buttons, {
			align: 'right'
		} );

		if ( text ) {
			this.textWidget.setValue( text );
		}

		this.$editor.append(
			this.textWidget.$element,
			this.buttonsField.$element
		);

		$container.append( this.$editor );

		this.$editor.css( {
			left: '-' + ( this.$editor.outerWidth() + 15 ) + 'px'
		} );

		this.cancelButton.once( 'click', function () {
			editor.$editor.remove();
			deferred.reject();
		} );

		this.saveButton.once( 'click', function () {
			deferred.resolve( editor.textWidget.getValue() );
		} );

		return deferred.promise();
	};

	mw.FileAnnotationEditor = FileAnnotationEditor;
}( mediaWiki, jQuery, OO ) );
