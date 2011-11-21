
// Transform csv files and upload to couchdb
// All csv files in the ./data directory are processed by default
// Usage: node <this script> <options>


// CONSTANTS and defaults
var APP_VERSION = '0.0.1';
var APP_MODULE_DIR = './app_modules';
var DEFAULT_DATA_DIR = './data';
var DEFAULT_CSV_OPTS = {trim: true, columns: true};
var DEFAULT_DB_NAME = 'iom_test';
var DEFAULT_DB_HOST = 'http://127.0.0.1';
var DEFAULT_DB_PORT = 5984;
var DEFAULT_DB_OPTS = { cache: false, raw: false };



// Import node.js core modules
//  http://nodejs.org/docs/latest/api/
var util = require('util');
var path = require('path');


// Import 3rd party modules

// Import opts command line options parser module
//  https://bitbucket.org/mazzarelli/js-opts/wiki/Home
var opts = require('opts');

// Import csv module for parsing csv files
//  https://github.com/wdavidw/node-csv-parser
var csv = require('csv');

// Import cradle module for interacting with couchdb
//  https://github.com/cloudhead/cradle
var cradle = require('cradle');

// Import underscore module for collection manipulation and utils
//  http://documentcloud.github.com/underscore/
var _ = require('underscore');
    

// Import application modules
var transformData = require(APP_MODULE_DIR + '/' + 'transform.js');


// parse command line options
var dbOptions = DEFAULT_DB_OPTS; // not configurable

var options = [
  { short       : 'v'
  , long        : 'version'
  , description : 'Show version and exit'
  , callback    : function () { console.log(APP_VERSION); process.exit(1); }
  },
  { short       : 'd'
  , long        : 'data-dir'
  , description : 'Set data directory to read from'
  , callback    : function (value) { 
        if ( path.existsSync(value) ) {        
            console.log('Using ' + value + ' for data directory.');
        }
        else {
            console.error('Data directory ' + value + ' does not exist.');
            process.exit(1);
        }    
    }
  , value       : true
  },
  { short       : 'n'
  , long        : 'name'
  , description : 'The name of couchdb database instance'
  , value       : true
  , callback    : function (value) { console.log('Using ' + value + ' for CouchDB database name.'); }
  },
  { short       : 'h'
  , long        : 'host'
  , description : 'The hostname of couchdb instance'
  , value       : true
  , callback    : function (value) {
        console.log(value);
        if ( ! value.match(/^http[s]?:\/\//) ) {
            console.error('Host ' + value + ' is invalid. Must be in the format "http://hostname".');
            process.exit(1);
        }
        console.log('Using ' + value + ' for CouchDB database host.'); 
    }
  },
  { short       : 'p'
  , long        : 'port'
  , description : 'The port of couchdb instance'
  , value       : true
  , callback    : function (value) { 
        if( isNaN( parseInt(value) ) ) {
            console.error('Port ' + value + ' is invalid.');
            process.exit(1);
        }
        console.log('Using ' + value + ' for CouchDB connection port.');
    }
  },
];

opts.parse(options, true);

dataDir = opts.get('data-dir') || DEFAULT_DATA_DIR;
dbName = opts.get('name') || DEFAULT_DB_NAME;
dbHost = opts.get('host') || DEFAULT_DB_HOST;
dbPort = opts.get('port') || DEFAULT_DB_PORT;


// data to read from
var fileName = 'iom-state.csv';

// try to open a database connection to couchdb
var db;
try {
    db = new(cradle.Connection)(dbHost,dbPort,dbOptions).database(dbName);
}
catch (err) {
    console.error('Unable to connect to a running CouchDB instance at '+ dbHost + ':' + dbPort + '/' + dbName);
    console.error('Check that the server is running and try again');
    console.error(err);
    process.exit(1);
}

// create db if it does not exist and load views and data
db.exists(function (err, exists) {
    if (err) { 
        console.error('Unable to check if CouchDB instance exists '+ dbHost + ':' + dbPort + '/' + dbName);
        console.error('Check that the server is running and try again');
        console.error(err);
        process.exit(1);
    }
    if ( ! exists ) {
        console.log('Creating database, ' + dbName + ', on ' + dbHost);
        db.create(function (err, res) {
            if ( err || res.ok === false ) { 
                console.error('Error creating database ' + dbName); 
                console.error(err);
                process.exit(1);
            }
            loadViews();
            loadData();
        });
    }
    else {
        loadViews();
        loadData();
    }
});


// Set up couchdb views
// Query Tennessee: 
//      http://127.0.0.1:5984/iom_test/_design/state/_view/all/?key="TN"
var loadViews = function () {
    db.save('_design/state', {
        all: {
            map: function (doc) {
                if (doc.STATE) emit(doc.STATE, doc);
            }
        }
    });
};

// Process input csv data
var loadData = function () {
    csv()
        .fromPath(dataDir+'/'+fileName, DEFAULT_CSV_OPTS)
        .transform(function(data){
            return transformData.transformRecord(data);
        })
        .on('data',function(data,index){
            db.save(data, function (err, res) {
                if (err) { console.error("Error on db update\n", err); }
            });
        })
        .on('end',function(count){
            console.log("\nCOMPLETED\nNumber of lines processed: "+count);
        })
        .on('error',function(err){
            console.error("\Error parsing csv file\n"+err);
        });
};

