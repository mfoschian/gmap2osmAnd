var Promise = require('promise');
var xml2js = require('xml2js');
var util = require('util');
var fs = require('fs');
 


function parseFile( file ) {
	return new Promise( function( resolve, reject ) {

		fs.readFile( file, function(err, data) {
			if( err ) {
				console.log( err );
				reject( new Error( "Cannot read file" ) );
				return;
			}
			
			var parser = new xml2js.Parser();
			parser.parseString(data, function (err, result) {
				if( err ) {
					console.log( err );
					reject( new Error( "Parse failed" ) );
					return;
				}
				
				resolve( result );
			});
		});
	});
}

function mapPlacemarks( placemarks, folderName ) {
	var items = placemarks.map( function( p ) {
		var wpt = {};
		wpt.name = p['name'][0];
		var coords = p['Point'][0]['coordinates'][0];
		coords = coords.replace(/[\n ]/g,"").split(",");
		wpt.lat = coords[1];
		wpt.lon = coords[0];
		if( folderName )
			wpt.category = folderName;
		return wpt;
	});
	return items;
}

var args = process.argv;
//console.log ( util.inspect( args ) );

var kmlfile = args[2];
if( !kmlfile ) {
	console.log( 'No input file specified' );
	process.exit();
}

var category = args[3];

//console.log( 'Converting file %s', kmlfile );
parseFile( kmlfile )
.then( function(result) {
	
	//console.log( 'File Parsed' );
	
	var kml = result['kml'];
	var doc = kml['Document'][0];
	var placemarks = doc['Placemark'];

	var items = [];
	
	//console.log( JSON.stringify( placemarks, null, 4 ) );
	if( placemarks ) {
		items = mapPlacemarks( placemarks, category );
	}
	else {
		var folders = doc['Folder'];

		for( var i=0; i<folders.length; i++  ) {
			var f = folders[i];
			var fname = f['name'][0];
			if( category )
				fname = category + ' - ' + fname;

			items = items.concat( mapPlacemarks( f['Placemark'], fname ) );
		}
	}

	//console.log( JSON.stringify( items, null, 4 ) );

	return items;
})
.then( function( wpts ) {
	var xml = [
		"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>",
		'<gpx version="1.1" creator="OsmAnd" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
	];
	var items = wpts.map( function( wpt ) {
		var x = '<wpt lat="'+wpt.lat+'" lon="'+wpt.lon+'">';
		if( wpt.name ) {
			x += '<name>'+wpt.name+'</name>';
			x += '<desc>'+(wpt.desc || wpt.name)+'</desc>';
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
});
