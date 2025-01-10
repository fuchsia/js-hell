import {spawn} from 'child_process';

export const js_hell = `IDL=1
-- Launch the external command CMD_NAME with ARG_TEXT... as args
spawn CMD_NAME ARG_TEXT... :: default(cwd.toString(),$1,$2)`; 

function 
toExit( exitcode, signal  ) {
    if ( typeof exitcode !== 'number' && exitcode !== null )
        throw new TypeError( `Illegal value for exitcode ${JSON.stringify(exitcode)}` );

    if ( typeof signal !== 'string' && signal !== null )
        throw new TypeError( `Illegal value for signal ${JSON.stringify(signal)}` );

    if ( signal === null && exitcode === null )
        throw new TypeError( "`exitcode` and `signal` cannot both be null" );

    if ( signal !== null && exitcode !== null )
        throw new TypeError( "`exitcode` and `signal` cannot both be NON null" );

    if ( exitcode !== null )
        return {
            type: 'exit',
            value: exitcode
        };
    else
        return {
            type: 'signal',
            value: signal
        }
}

export default function( cwd, command, args ) {
    return new Promise( ( resolve, reject ) => {
        console.log( "args:", JSON.stringify( args ) );
        // FIXME: on windows we want windowsVerbatimArguments and to rejoin them.
        const child = spawn( command, args, {
            cwd,
            // FIXME: should be able to control this.
            // if `process.env` is in the lexical environment, then we can pass it through
            // like we do cwd. Ditto stdio.
            env: process.env,
            windowsHide: true,
            detached: false,
            encoding: 'utf8',
            // FIXME: implement this?
            // // windowsVerbatimArguments: true,

            // Should we be going through the shell?
            // On windows we should invoke ourselves with /c
            shell: false,
            // Should we blocking stdio?
            // Should we be collected stderr? Do we need command for this? 
            stdio: [ 'ignore', 'pipe', 'pipe' ],
        } );
        
        // Q: Should we use the stream creating tools and pass our own buffer
        // rather than doing it here?
        let stdout = '';
        child.stdout.on( 'data', (data) => {
            stdout += String( data );
        });
        
        let stderr = '';
        child.stderr.on( 'data', (data) => {
            stderr += String( data );
            const lines = stderr.split( /\r?\n/ );
            for ( let i = 0; i < lines.length - 1; ++i ) {
                console.error( lines[i] );
            }
            stderr = lines.at( -1 );
        });
    
        // `The 'close' event will always emit after 'exit' was already emitted, or 'error' if the child failed to spawn.`
        // Node doesn't explain how we spot an error in the event of it not having spawned...
        child.on( 'close', ( code, signal ) => {
            try {
                if ( stderr ) 
                    console.error( stderr );
                const {/*type,*/value} = toExit( code, signal );
                resolve({
                    exit: value, //< This will be the exit code (a number) or the signal name (a string).
                    stdout,
                } );
            } catch ( err ) {
                reject( err );
            }
        });
        
    } );
}

    