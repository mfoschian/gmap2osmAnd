var Promise = require('promise');
var xml2js = require('xml2js');
var util = require('util');
var fs = require('fs');

var debug = true;
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

function toGpx( wpts ) {

	// Format data into gpx xml string
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
	var gpx = xml.join("\n");

	return gpx;
}

function saveGpx( filename, wpts ) {

	let gpx = toGpx( wpts );

	fs.writeFile(filename, gpx, function(err) {
		if(err) {
			console.log('*** Error saving %s: %s', filename, err);
		}
	}); 	
}

function mapPlacemarks( placemarks, folderName ) {
	try {
		var items = placemarks.map( function( p ) {
			var wpt = {};

			// Name
			wpt.name = p['name'][0];

			var desc = p['description'];
			if( desc && desc[0] ) {
				wpt.desc = desc[0];
			}

			var point = p['Point'];
			if( point && point[0] ) {
				point = point[0]['coordinates'][0];
				point = point.replace(/[\n ]/g,"").split(",");
				wpt.lat = point[1];
				wpt.lon = point[0];
			}

			if( folderName )
				wpt.category = folderName;

			return wpt;
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

var basefile = kmlfile.replace('.kml','')

var category = args[3];

if( debug ) console.log( '*** Converting file %s', kmlfile );
parseFile( kmlfile )
.then( function(result) {
	
	if( debug ) console.log( '*** File Parsed' );
	// console.log( JSON.stringify( result, null, 4 ) );
	
	var kml = result['kml'];
	var doc = kml['Document'][0];
	var placemarks = doc['Placemark'];

	
	// console.log( JSON.stringify( placemarks, null, 4 ) );
	if( placemarks ) {
		// Only the default folder
		var items = [];
		var outfile = basefile + '.gpx';
		items = mapPlacemarks( placemarks, category );

		saveGpx( outfile, items );
		return items;
	}

	if( debug ) console.log( '*** No Placemark, search for Folders' );
	var folders = doc['Folder'];

	for( var i=0; i<folders.length; i++  ) {
		var f = folders[i];
		var fname = f['name'][0];
		var flabel = fname;
		if( debug ) console.log( '*** Found folder %s', fname );
		if( category )
			flabel = category + ' - ' + fname;

		var places = mapPlacemarks( f['Placemark'], flabel );
		if( debug ) console.log( '*** -- %s markers added', places.length );

		var outfile = basefile + '.' + fname + '.gpx';
		saveGpx( outfile, places );
	}

	// if( debug ) console.log( JSON.stringify( items, null, 4 ) );

	return [];
})
.then( undefined, function( err ) {
	console.error( err );
});
