var Promise = require('promise');
var xml2js = require('xml2js');
var util = require('util');
var fs = require('fs');

var debug = false;
var add_desc = true;


function parseFile( file ) {
	return new Promise( function( resolve, reject ) {

		fs.readFile( file, function(err, data) {
			if( err ) {
				//console.log( err );
				reject( new Error( "Cannot read file" ) );
				return;
			}
			
			var parser = new xml2js.Parser();
			parser.parseString(data, function (err, result) {
				if( err ) {
					//console.log( err );
					reject( new Error( "Parse failed" ) );
					return;
				}
				
				resolve( result );
			});
		});
	});
}

function cdata( s ) {
	return '<![CDATA[' + s + ']]>';
}
/*
function tag( v ) {
	return '<' + tag + '>' + value + '</'+ tag +'>';
}
*/

function toGpx( items ) {

	// Format data into gpx xml string
	let xml = [
		"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>",
		'<gpx version="1.1" creator="OsmAnd" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
	];
	let elements = items.map( function( item ) {

		let extra = '';
		if( item.name ) {
			extra += '<name>'+cdata(item.name)+'</name>';
			if( add_desc )
				extra += '<desc>'+cdata(item.desc || item.name)+'</desc>';
			else
				extra += '<desc>'+cdata(item.name)+'</desc>';
		}

		if( item.category )
			extra += '<type>'+cdata(item.category)+'</type>';

		if( item.comment )
			x += '<cmt>'+cdata(item.comment)+'</cmt>';

		if( item.color )
			extra += '<extensions><color>#' + item.color + '</color></extensions>';

		let x = null;
		if( item.lat && item.lon ) {
			// Waypoint
			x = '<wpt lat="'+item.lat+'" lon="'+item.lon+'">'
				+ extra
				+ '</wpt>'
				;
		}
		else if( item.line ) {
			x = '<trk>' + extra + '<trkseg>';
			for( let i=0; i<item.line.length; i++ ) {
				let p = item.line[i];
				if( p.lat && p.lon )
					x += '<trkpt lat="'+p.lat+'" lon="'+p.lon+'"></trkpt>';
			}
			x += '</trkseg></trk>';
		}
		else
			x = '';

		return x;
	});

	xml = xml.concat( elements ).concat( [ '</gpx>' ] );
	let gpx = xml.join("\n");

	return gpx;
}

function parseColor( c ) {
	// aaBBGGRR -> aaRRGGBB
	let aa = c.substring(0,2);
	let BB = c.substring(2,4);
	let GG = c.substring(4,6);
	let RR = c.substring(6,8);
	let aaRRGGBB = aa + RR + GG + BB;
	return aaRRGGBB;
}

function mapPlacemarks( placemarks, folderName, styles ) {
	try {
		let items = placemarks.map( function( p ) {
			let item = {};

			// Name
			item.name = p['name'][0];

			var desc = p['description'];
			if( desc && desc[0] ) {
				item.desc = desc[0];
			}

			var point = p['Point'];
			if( point && point[0] ) {
				// map to wpt
				point = point[0]['coordinates'][0];
				point = point.replace(/[\n ]/g,"").split(",");
				item.lat = point[1];
				item.lon = point[0];
				item.alt = point[2];
			}

			let line = p['LineString'];
			if( line && line[0] ) {
				// map to trkseg / trkpt
				line = line[0]['coordinates'][0];
				let points = line.replace(/ /g,"").split("\n");
				item.line = points.map( function(s) {
					let point = s.replace(/[\n ]/g,"").split(",");
					return {
						lat: point[1],
						lon: point[0],
						alt: point[2]
					};
				});
			}

			let style = p['styleUrl'];
			if( style && style[0] ) {
				let style_id = style[0];
				let x = styles[style_id];
				if( x ) {
					item.color = x.color;
					item.width = x.width;
					item.icon = x.icon;
				}
			}

			if( folderName )
				item.category = folderName;

			return item;
		});
		return items;
	}
	catch( e ) {
		if( debug ) console.log( '*** error: %s', e );
		return [];
	}
}

var args = process.argv;
//console.log ( util.inspect( args ) );

var kmlfile = args[2];
if( !kmlfile ) {
	console.log( 'No input file specified' );
	process.exit();
}

var category = args[3];

if( debug ) console.log( '*** Converting file %s', kmlfile );
parseFile( kmlfile )
.then( function(result) {
	
	if( debug ) console.log( '*** File Parsed' );
	// console.log( JSON.stringify( result, null, 4 ) );

	let kml = result['kml'];
	let doc = kml['Document'][0];

	// Map Styles and StyleMap
	let styles = {};
	let ss = doc['Style'];
	for( let i=0; i<ss.length; i++ ) {
		let style = {};
		let s = ss[i];

		// get id
		let attr = s['$'];
		if( !attr || !attr.id )
			continue;

		let style_id = attr.id;

		let icon = s['IconStyle'];
		if( icon && icon[0] ) {
			let color = icon[0].color;
			if( color && color[0] ) {
				style.color = parseColor(color[0]);
			}

			icon = icon[0]['href'];
			if( icon && icon[0] ) {
				style.icon = icon[0];
			}
		}

		let line = s['LineStyle'];
		if( line && line[0] ) {
			if( !style.color ) {
				let color = line[0].color;
				if( color && color[0] ) {
					style.color = parseColor(color[0]);
				}
			}
		}

		if( style )
			styles['#'+style_id] = style;
	}

	let sm = doc['StyleMap'];
	for( let i=0; i<sm.length; i++ ) {
		let m = sm[i];

		// get id
		let attr = m['$'];
		if( !attr || !attr.id )
			continue;

		let id = attr.id;

		/*
			<Pair>
				<key>normal</key>
				<styleUrl>#icon-1501-0288D1-normal</styleUrl>
			</Pair>
		*/
		// map only the "normal" style
		let pairs = m['Pair'] || [];
		for( let j=0; j<pairs.length; j++ ) {
			let p = pairs[j];
			let k = p['key']
			if( k && k[0] == 'normal' ) {
				let v = p['styleUrl'] || [];
				let s = styles[v];
				if( s ) {
					styles['#' + id] = s;
					break;
				}
			}
		}
	}


	// Get Placemarks and tracks
	let placemarks = doc['Placemark'];
	let items = [];

	// console.log( JSON.stringify( placemarks, null, 4 ) );
	if( placemarks ) {
		items = mapPlacemarks( placemarks, category );
	}
	else {
		if( debug ) console.log( '*** No Placemark, search for Folders' );
		var folders = doc['Folder'];

		for( var i=0; i<folders.length; i++  ) {
			var f = folders[i];
			var fname = f['name'][0];
			if( debug ) console.log( '*** Found folder %s', fname );
			if( category )
				fname = category + ' - ' + fname;

			var places = mapPlacemarks( f['Placemark'], fname, styles );
			if( debug ) console.log( '*** -- %s markers added', places.length );
			items = items.concat( places );
		}
	}

	// if( debug ) console.log( JSON.stringify( items, null, 4 ) );

	return items;
})
.then( toGpx )
.then( function( gpx ) {
	console.log( gpx );
})
/*
.then( function( wpts ) {

	var xml = [
		"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>",
		'<gpx version="1.1" creator="OsmAnd" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
	];
	var items = wpts.map( function( wpt ) {
		var x = '<wpt lat="'+wpt.lat+'" lon="'+wpt.lon+'">';
		if( wpt.name ) {
			x += '<name>'+wpt.name+'</name>';
			if( add_desc )
				x += '<desc>'+(wpt.desc || wpt.name)+'</desc>';
			else
				x += '<desc>'+(wpt.name)+'</desc>';
		}
		if( wpt.category )
			x += '<type>'+wpt.category+'</type>';
		if( wpt.comment )
			x += '<cmt>'+wpt.comment+'</cmt>';

		x += '</wpt>';
		return x;

	});
	
	xml = xml.concat( items ).concat( [ '</gpx>' ] );
	console.log( xml.join("\n") );
}) 
*/
.then( undefined, function( err ) {
	console.error( err );
});
