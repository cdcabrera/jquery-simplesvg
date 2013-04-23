/*
* SVG Plugin
* Copyright 2013, CDCabrera, menotyou.com
* licensed under MIT license, http://opensource.org/licenses/mit-license.php
*
* Utilized Keith Wood's SVG for jQuery v1.4.5 plugin as a reference for what class methods to include
* http://keith-wood.name/svg.html
* Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and
* MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses.
*/

(function(window, $, undefined){

	$.simplesvg = function(_settings)
	{
		_settings = $.extend(true,
		{
			display         :   null,
			file            :   null,                                           //-- string: svg file path reference
			//supported       :   ('createElementNS' in window.document),         //-- boolean: is svg supported, use your own
			supported       : ('SVGSVGElement' in window),
			selector        :   null,                                           //-- string or array of strings: selector string or an array of CSS selector strings used to find svg nodes
			event           :   {},                                             //-- object: object of events applied to the svg as a whole, use the form of {click:function(){}, mouseover:function(){}}
			autoshow        :   true,                                           //-- boolean: plugin automatically appends and shows content, otherwise user appends content using the "complete" callback
			complete        :   null,                                           //-- function: callback for plugin loaded
			unsupported     :   null,                                           //-- DOM element, jQuery element, CSS selector string, html string or function that returns all of the aforementioned: displays alternate content for unsupported browsers. This creates a deep clone and detaches the original element if it exists.
			error           :   null
		}, _settings);


		_go();

		//-- start everything
		function _go()
		{
			var objs        = $(_settings.display),
				file        = _settings.file,
				selector    = _settings.selector,
				supported   = _settings.supported;

			if( !objs.length || !file || !selector )
			{
				return;
			}

			$.when(_getsvgdata()).then(function(data)
			{
				_setupcontent(objs, data);
			}, _error);
		}



		//-- get data svg or otherwise
		function _getsvgdata()
		{
			var def     = new $.Deferred(),
				file    = _settings.file;

			$.ajax(
			{
				url         :   file,
				dataType    :   'text', //-- bypass malformed "xml"
				cache       :   false,
				error       :   function()
								{
									def.resolve(null);
								},
				success     :   function(data)
								{
									def.resolve( $('<div/>').html(data).children() );
								}
			});

			return def.promise();
		}



		//-- handle error callback
		function _error()
		{
			var error       = _settings.error,
				supported   = _settings.supported;

			if( $.isFunction(error) )
			{
				error.call(this,{supported : supported});
			}
		}



		//-- setup the display content
		function _setupcontent( objs, svgdata )
		{
			if( !svgdata )
			{
				_error();
				return;
			}

			var complete    = ($.isFunction(_settings.complete))? _settings.complete : function(){},
				autoshow    = _settings.autoshow,
				supported   = _settings.supported,
				unsupported = _settings.unsupported,
				tempfunc    = ($.isFunction(unsupported))? unsupported : function(){return $(unsupported);},
				selector    = ($.isArray(_settings.selector))? _settings.selector.join(',') : _settings.selector;

			objs.each(function()
			{
				var self            = this,
					jself           = $(this),
					svgclone        = svgdata.clone(true),
					svgnodes        = svgclone.find(selector),
					dataobj         = {
										parent  : self,
										display : null,
										svg     : svgclone,
										alt     : null
									  };

				//-- call unsupported here so we can pass back svg information
				//-- to be used for alternate purposes
				$.when(tempfunc.call(this, {data:dataobj, nodes:svgnodes, supported:supported})).then(function(data)
				{
					var altdata = $('<div/>').append($(data)).children(); //-- byproduct, if exists remove visibility

					//altdata.each(function(){ //-- remove the id for cloning //-- forget that, they can figure it out...
						//$(this).removeAttr('id');
					//});

					var altclone        = altdata.clone(true),
						displayclone    = ( supported )? svgclone : altclone,
						methods         = _displaymethods.call( this, jself, displayclone );

					dataobj.display = (displayclone.length)? displayclone : null;
					dataobj.alt     = (altclone.length)? altclone : null;

					if( supported && altclone.length )
					{
						_setevents( selector, altclone, dataobj, svgnodes );
					}

					if( displayclone.length )
					{
						_setevents( selector, displayclone, dataobj, svgnodes );

						if(autoshow)
						{
							jself.html( displayclone );
						}
					}

					complete.call(self,
					{
						data        : dataobj,
						methods     : methods,
						nodes       : svgnodes,
						supported   : supported
					});

				}, _error);
			});
		}



		//-- attach user defined event object
		function _setevents( selector, data, dataobj, svgnodes )
		{
			var event       = _settings.event,
				supported   = _settings.supported;

			$.each(event,function(key,value){

				//-- decided this was a bad idea and countered the point of the delegated event structure
				//if(/change/i.test(key)) //-- override event selectors
				//{
					//selector = 'select';
				//}

				data.on(key, selector, function()
				{
					var jself       = $(this),
						args        = [].concat(Array.prototype.slice.call(arguments)),
						methods     = $.extend( true, _classmethods.call(this, jself), _svgmethods.call(this, jself, dataobj) ),
						dimensions  = _getCoords.call( this, dataobj.parent ); //this.getBBox(),
						attributes  = {};

					$(this.attributes).each(function()
					{
						attributes[this.nodeName] = this.nodeValue;
					});

					dimensions =
					{
						width:dimensions.width,
						height:dimensions.height,
						x:dimensions.x,
						y:dimensions.y
					};

					args.push({
						data        : dataobj,
						dimensions  : dimensions,
						attributes  : attributes,
						nodes       : svgnodes,
						methods     : methods,
						supported   : supported
					});

					value.apply(this, args);
				});

			});
		}



		//-- return the coords relative to the parent...
		//-- based off of how SVG maps coords
		function _getCoords( container )
		{
			var jself   = $(this),
				bbox    = ( 'getBBox' in this )? this.getBBox() : null,
				obj     = {},
				altpos,
				containerpos;

			if( bbox )
			{
				obj = bbox;
			}
			else
			{
				altpos = jself.offset();
				containerpos = $(container).offset();

				obj.x = altpos.left - containerpos.left;
				obj.y = altpos.top - containerpos.top;
				obj.width = jself.outerWidth(true);     //-- didnt use "getBoundingClientRect" on purpose... trying to match how "getBBox" would return coords
				obj.height = jself.outerHeight(true);
			}

			return obj;
		}




		//-- additional svg helper methods
		function _svgmethods( jself, dataobj )
		{
			var self    = jself.get(0),
				parent  = jself.parent(),
				siblings= parent.children().not(self),
				coords  = _getCoords.call( self, dataobj.parent ); //( 'getBBox' in self )? self.getBBox() : { x:jself.offset().left, y:jself.offset(.top, width:null, height:null },
				centerx = coords.x + (coords.width / 2) + 'px',
				centery = coords.y + (coords.height / 2) + 'px',
				xandy   = centerx+' '+centery;


			return {
				centerOrigin : function()
				{
					self.style.msTransformOrigin = self.style.OTransformOrigin = self.style.MozTransformOrigin = self.style.webkitTransformOrigin = self.style.transformOrigin = xandy;

					return {x:centerx, y:centery};
				},

				aboveSiblings : function()
				{
					parent.prepend( siblings );
				},

				belowSiblings : function()
				{
					parent.append( siblings );
				}
			};
		}



		//-- additional class manipulation methods customized for svg
		function _classmethods( jself )
		{
			function addremoveclass( value, remove )
			{
				var self            = jself.get(0),
					valuefunc       = ( $.isFunction( value ) )? value : function(i,v){ return value; },
					currentclasses  = ( jself.attr('class') || '' ),
					returnedclases  = valuefunc.call( self, 0, currentclasses ),
					classarray      = ($.trim(currentclasses)).replace(/\s+/g,' ').split( /\s+/ ),
					testarray       = ($.trim(returnedclases)).replace(/\s+/g,' ').split( /\s+/ ),
					newarray        = [];

				if( remove )
				{
					$.each(classarray, function(index,value)
					{
						if( $.inArray( value, testarray ) < 0 )
						{
							newarray.push( value );
						}
					});
				}
				else
				{
					newarray = classarray;

					$.each(testarray, function(index,value)
					{
						if( $.inArray( value, classarray ) < 0 )
						{
							newarray.push( value );
						}
					});
				}

				return jself.attr('class', newarray.join(' '));
			}



			return {
				addClass : function( value )
				{
					return addremoveclass( value, false );
				},


				removeClass : function( value )
				{
					return addremoveclass( value, true );
				},


				hasClass : function( value )
				{
					var current = ( jself.attr('class') || '' ).replace(/[\t\r\n]/g, ' ');
					return ( (' ' + current + ' ').indexOf( ' ' + value + ' ' ) > -1 );
				}
			};
		}




		//-- additional onloaded methods
		function _displaymethods( jself, data )
		{
			return {
				on : function()
				{
					if( data.length )
					{
						$(data).detach(); //-- double check to avoid overwritting
						jself.html( data );
					}
				},

				off : function()
				{
					if( data.length )
					{
						$(data).detach();
					}
				}
			};
		}
	};

})(this, jQuery);