import json_q from "../utils/json_q.mjs";
import Console from "./Console.mjs";
import {createWriteStream} from "node:fs";

/**
    This is our async storage. It's installed with `runShellJob()` and returned via `getCurrentShellJob()`.
    It points to the shell and the console. It also currently stores the lexicalEnvironemntOptions
    but I think that is a historical quirk and they should be regenerated from the shell (probably 
    with the shellJob tracking any redirected io). FIXME: It should also be the respository for any
    cleanups (which is just the database, at present).
*/
export default class 
ShellJob {
    #shell;
    get shell() { return this.#shell }
    
    #logStream;          // <WritableStream>
    #console;            //< <Console>
    get console() { return this.#console }

    // Should these even exist. Or should we dynamically create it from the shell, on demand?
    // Particularly with the case of empty shell jobs.
    lexicalEnvironmentOptions;  //< <dictionary>

    
    #cleanup = null;        //< <function[]> Callbacks to call when done.
    
    constructor( shell, lexicalEnvironmentOptions = {}, console = shell.console ) {
        this.#shell = shell;
        this.#console = console;
        this.lexicalEnvironmentOptions = lexicalEnvironmentOptions;
    }
    
    async openLog( logfile ) {
        if ( !logfile ) 
            return;
        if ( typeof this.#logStream !== 'undefined' )
            throw new Error( "Job cannot have multiple log files" );

        const logStream = this.#logStream = createWriteStream( logfile ); 
        await new Promise( resolve => logStream.once( "open", resolve ) );
        this.#logStream = logStream;

        // NB This is a custom Console type which (inherits) the regular Console. And the second arg is the level.
        this.#console = new Console( logStream, 0, { colorMode: false } );
    }
    
    async flushStatusAndCloseLog() {
        this.#console.statusFlush?.();
        if ( typeof this.#logStream === 'undefined' ) 
            return;
        const pendingStreamToClose = this.#logStream;
        this.#logStream = undefined;
        this.#console = this.#shell.console;
        const closed = new Promise( resolve => pendingStreamToClose.once( "close", () => resolve() ) );
        pendingStreamToClose.close();
        await closed;
    }

    // Q: Should we be an event listener? i.e. this would be `addEventLister( ...args )`
    // and we delegate to a hidden listener?
    registerCleanup( callback ) {
        if ( typeof callback !== 'function' ) {
            throw new Error( "Callback must be a function" );
        }
        if ( !this.#cleanup ) {
            this.#cleanup = [];
        }
        this.#cleanup.push( callback );
    }
    
    /// @brief Run any registered cleanup. 
    ///
    /// @note This doesn't call `flushStatusAndCloseLog()` which also
    /// needs to be called. (Should we? Should we register that?)  
    /// 2025_1_10: Should this handle async cases?  
    finalise({stacktrace = false}={}) {
        const cleanup = this.#cleanup;
        if ( !cleanup )
            return;
        this.#cleanup = null;
        // Reverse registration order. Faster to do by index
        // that a call to `reverse()` and an iterator.
        for ( let i = cleanup.length; i--; ) {
            const callback = cleanup[i];
            try {
                callback();
            } catch ( err ) {
                // Q: should stacktrace be built into the console itself?
                this.#console.error( "cleanup:", stacktrace ? err.stack : err.message ); 
            }
        }
    }
    // Used to check the root shell job hasn't aquired finalisation.
    hasFinalisation() {
        return !!this.#cleanup?.length;  
    }

};



