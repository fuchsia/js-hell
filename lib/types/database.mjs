import {fromObjectArray as Columns_fromObjectArray} from "../output/Table/fromObjectArray.mjs";
import parseCsv from "../output/Table/parseCsv.mjs";

// FIXME: this means we need shellJobs as a global feature;
// not a host specific feature.
import {getCurrentShellJob} from "../host/shellJobs.mjs";
const DEBUG = false;
let Database = null;

function 
Sql_quote( text )
    {
        // 2023_9_19: Couldn't find a definition. This is sqlite's code:
        // https://sqlite.org/src/file?name=src/tokenize.c&ci=tip
        // It seems to require doubling up of delimeters. So we do that.
        // Mysql has a wider spec, but who knows if sqlite supports it.
        // https://dev.mysql.com/doc/refman/8.0/en/string-literals.html
        return `'${text.replaceAll( "'", "''" )}'`;
    }

function 
Database_fromColumns( columns, tableName )
    {
        const database = new Database( ":memory:" );
        const sqlTableName = Sql_quote(tableName),
              sqlColumnNames = columns.map( column => Sql_quote(column.name) ); 
        database.exec( `BEGIN TRANSACTION` );
        // FIXME: It would be nice if fromObjectArray estimated type: i.e. are all INTS (NUMBERS/TEXT). Are there undefined/nulls?
        database.exec( `CREATE TABLE ${sqlTableName} ( ${sqlColumnNames.map( name => `${name} TEXT` ).join( ',' )} )` );
        const stmt = database.prepare(  `INSERT INTO ${sqlTableName} VALUES ( ${columns.map( c => '?' ).join( ',' )} ) ` );
        // Oh look we're rebuilding table.
        // Anyway, `Math.min()` and `Math.max()` should be the same. We don't check.
        // This turns up often enough is it worth factoring out. The first row the names, the rest the columns?
        // Could the above optimise it?
        const rowCount = Math.min( ...columns.map( c => c.data.length ) );
        for ( let i = 0; i < rowCount; ++i ) {
            const row = columns.map( c => c.data[i] );
            stmt.run( ...row ); 
        }
        database.exec( `COMMIT TRANSACTION` );
        return database;    
    }

export default async function 
getDatabase( syncFile, defaultTableName )
    {
        if ( !Database ) {
            try {
                Database = ( await import( "better-sqlite3" ) ).default;
            } catch ( err ) {
                // Should we set `err` as a cause rather than logging it here?
                console.debug( "import better-sqlite3 failed: ", err );
                throw new Error( "database utilities need optional dependency `better-sqlite3` to be installed" );
            } 
        }
        // We can then do js-hell select 'x,y from STDIN'
        if  ( syncFile.type === 'application/vnd.sqlite3' ) {
            // Q: Should we provide our own API/restrictions, even if we backend it? Because otherwise we've inserted our
            // own dependency and AP1=1 is now tied to our version of better-sqlite3.
            //
            // (Could add a `REQUIRE={better-sqlite3:3.2.2}` pragma? )
            //
            // A: The plan is now to move to node's sqlite implementation and leave the compatibility
            // to the user in the same way they would for node. (We could insert a node requirement, though.)
            const name = syncFile.fullPath;
            const database = new Database( name );
            // Q: Could we use a proper finaliser here - at least as a cover? Or could it be built into the bind
            // so if it throws, it catches and does a finalisation pass?
            //
            // Q: Should we share dbs amongst the shell. i.e. it is pointless opening and closing dbs in a pipeline
            // when we could open it once. Although that brings, it's own issues. (Add a `{share:true}` dictionary
            // entry to `.database()`? Block pragma?) )
            getCurrentShellJob().registerCleanup( () => {
                DEBUG && console.log( "close", name );
                database.close() 
            });
            return database;
        } else if ( syncFile.type === 'application/json' ) {
            const json = syncFile.toJSON();
            if ( !Array.isArray( json ) ) {
                // Not the only way, we could handle an object - the only question is what to call the name.
                throw new TypeError( "JSON database must be an array" );
            }
            const objectArray = Columns_fromObjectArray( json );
            return Database_fromColumns( objectArray, defaultTableName ); 
        } else if ( syncFile.type === 'text/csv' ) {
            return Database_fromColumns( parseCsv( syncFile.toText() ), defaultTableName );
        }
        // FIXME: this should handle CSV and PSV. 
        throw new TypeError( `Cannot turn file (${syncFile.type}) into database` );        
    }
    

 