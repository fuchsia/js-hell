// 2023_9_19: Didn't work, we added it to the command line.
// import v8 from "node:v8";
// v8.setFlagsFromString( "--no-warnings" );

export default class Reporter {
    
    jasmineStarted( suitInfo )
        {
            process.write( "tests\n" );
            /* // 2023_9_19: This wasn't working either.
            process.on( "warning", event => {
                console.log( "warning", event );
                process.exit( 0 );
                event.preventDefault();
                event.stopImmediatePropogation();
            } );*/
        }

    specStarted( spec )
        {
            process.stdout.write( `${spec.id}: ${spec.fullName}:` );
        }

    specDone( result  )
        {
            
            process.stdout.clearLine( 0 );
            process.stdout.write( "\r" );
            
            if ( result.status !== "passed" ) {
                process.stdout.write( `FAILED: ${result.fullName}: ${result.status}\n\n\n` );
            }
        }
};  