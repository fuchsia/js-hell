import {Console} from "node:console";
import {formatWithOptions} from "node:util";

export const 
      LEVEL_DEBUG = 1,
      LEVEL_ERROR = -2,
      LEVEL_WARN = -1,
      LEVEL_INFO = 0;

const ANSI_ERASE_LINE = "\x1b[2K",
      ANSI_CURSOR_UP = "\x1bM";

export default class
ConsoleWrapper extends Console
{
    #stream;
    
    #verbosity ;
    #tty;                  // #stream.TTY; FIXME: just use stream; this is here for laziness.
    #lastWrite = '';       // id of last write operation.       
    #lastCounter = '';     // string: Label of last counter written to.
    #fullStatus = '';      // string: the full status text. For debugging really.       
    #status = '';          // string: the status as written to the screen (truncated for width).

    #beforeWrite() {
        if ( this.#status !== '' ) {
            this.#stream.write( ANSI_ERASE_LINE );
        }
    }
    #afterWrite() {
        if ( this.#status !== '' ) {
            this.#stream.write( this.#status );
        }
    }

    constructor( stream, verbosity = LEVEL_INFO, { colorMode } = {} )
        {
            super( {stdout:stream/*,stderr:stream*/,colorMode} );
            this.#verbosity = verbosity;
            this.#tty = !!stream.isTTY;
            this.#stream = stream;
        }

    debug( ...args )
        {
            if ( this.#verbosity >= LEVEL_DEBUG ) {
                super.debug( ...args );
                this.#lastWrite = 'debug';
            }
        }
    
    error( ...args )
        {
            if ( this.#verbosity >= LEVEL_ERROR ) {
                this.#beforeWrite();
                super.error( ...args );
                this.#afterWrite();
                this.#lastWrite = 'error';
            }
        }
    
    info( ...args )
        {
            // Info is an alias for log; but we separate it, and give it higher (or lower) priority?
            if ( this.#verbosity >= LEVEL_INFO ) {
                this.#beforeWrite();
                super.info( ...args );
                this.#afterWrite();
                this.#lastWrite = 'info';
            }
        }
    
    log( ...args )
        {
            if ( this.#verbosity >= LEVEL_INFO ) {
                this.#beforeWrite();
                super.log( ...args );
                this.#afterWrite( );
                this.#lastWrite = 'log';
            }
        }

    warn( ...args )
        {
            if ( this.#verbosity >= LEVEL_WARN ) {
                this.#beforeWrite();
                super.warn( ...args );
                this.#afterWrite();
                this.#lastWrite = 'warn';
            }
        }

    count( label = 'default' ) {
        if ( this.#tty ) {
            if ( this.#lastWrite === 'count' && this.#lastCounter === label ) {
                this.#stream.write( ANSI_CURSOR_UP );    
            } 
        }
        super.count( label );
        this.#lastWrite = 'count';
        this.#lastCounter = label;
    }
    
    countReset( label = 'default' ) {
        if ( this.#tty && this.#lastWrite === 'count' && this.#lastCounter === label ) {
            this.#stream.write( ANSI_CURSOR_UP + ANSI_ERASE_LINE );    
        }
    }

    /// @brief Status writes a transient message that overwrites the previous status message and
    /// is not recorded in logs - except, perhaps, on error.  
    status( format, ...args ) {
        if ( !this.#tty )
            return;
        
        this.#fullStatus = formatWithOptions( { color: true, breakLength: Infinity, compact: Infinity }, format, ...args );
        const columns = typeof this.#stream.columns === 'number' ? this.#stream.columns : 80;
        // 2024_8_27: I'm divided about the merits of using '\r' here. The benefits are 
        //   - our text is erased (partially, at least) if anyone else writes to our stream. 
        //   - we don't overwrite something that has been written to the console by
        //     someone else.
        // It is annoying though...  
        this.#status = this.#fullStatus.slice( 0, columns - 1 ) + '\r';
        // We do ANSI_ERASE_LINE in case the previous line was longer. 
        this.#stream.write( ANSI_ERASE_LINE + this.#status );
    }

    
    statusClear() {
        if ( !this.#tty || this.#status === '' )
            return;
        this.#stream.write( ANSI_ERASE_LINE );
        this.#fullStatus = '';
        this.#status = '';
    }
    
    statusFlush()  {
        if ( this.#status === '' )
            return;

        if ( this.#tty  ) {
            this.#stream.write( '\x0a' );
        } else {
            this.#stream.write( this.#fullStatus + '\n' );
        }
        this.#fullStatus = '';
        this.#status = '';
    }   

};