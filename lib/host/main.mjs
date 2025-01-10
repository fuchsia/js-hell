import resolveScriptlet,{PACKAGE_KEY_JS_HELL}  from "./resolve.mjs";
import {parseText as Argtok_fromString,parseArray as Argtok_fromArray,ARG_NAME,ARG_OPERATOR,ARG_NAMED_VALUE,ARG_POSITIONAL_VALUE,INFO_HASVALUE,INFO_NONE} from "../args/argtok.mjs";
import {KEY_POSITIONAL} from "../Idl.mjs";
//import {Console} from "node:console";
import jshellFetch from "./fetch.mjs";
import * as Math from "./Math.mjs";
import * as path from "./path.mjs";
export {PACKAGE_KEY_JS_HELL};
import json_q from "../utils/json_q.mjs";
import {PRE_SCRIPTLET_OPTIONS} from "./hostOptions.mjs";
import * as UserUtils from "./UserUtils.mjs";
import Statement,{CAPTURE_FILETOPIC, CAPTURE_NONE, CAPTURE_OPTIONAL_VALUE, CLI_STATEMENT} from "./Statement.mjs";
import {CompoundStatement,CLI_OPERATOR,COMPOUND_AND,isOperatorCommandDivider} from "./CommandLine.mjs";
import {USE_JS_HELL_SCRIPTLET} from "./config.mjs";
import {runShellJob,getCurrentShellJob} from "./shellJobs.mjs";
import Console from "./Console.mjs";
import ShellJob from "./ShellJob.mjs";
import {EXIT_ARGV_ERROR, EXIT_FAILURE, EXIT_IDL_ERROR, EXIT_JS_HELL_EXCEPTION, EXIT_SCRIPTLET_EXCEPTION, EXIT_SUCCESS} from "./exit_codes.mjs";

import Instr from "../Instr.mjs";
import {readVersion} from "../env/parse.mjs";

// FIXME: we don't want to be importing this.  It's a stop gap.
import Usage from "../usage/Usage.mjs"; 
  

let orgConsole; 
function 
installConsole() {
    if ( typeof orgConsole !== 'undefined' )
        return;
    orgConsole = globalThis.console;
    // This makes `console` fantastically efficient, doesn't it?
    Object.defineProperty( globalThis, 'console', { get: () => getCurrentShellJob()?.console ?? orgConsole } );
}

function
Object_isEmpty( object ) {
    return Object.keys( object ).length === 0;
    for ( const key in object ) {
        if ( Object.hasOwn( object, key ) )
            return false;
    }
    return true;
}


class 
VersionError extends Error {
    constructor( ...args ) {
        super( ...args );
    }
    static name = "VersionError";
    get name() {
        return VersionError.name;
    }
};

/// @brief  The name is a minsomer. These are options that are turned into commands.
const redirectingOptions = new Map( [
    [ '--help', 'help' ],
    [ '-h', 'help' ],
    [ '/?', 'help' ],
    [ '--version', 'version' ],
    [ '-v', 'version' ],
] );

export function
parseInvocation( argIterator, { stacktrace = false, inspect = false, reparse = false, head = true, pipeTail = false, jsHellAllowed = false, versionAllowed = false } = {}  ) {
    if ( jsHellAllowed !== true )
        throw new TypeError( "`js-hell` should always be a valid initial token" );
    const result = [];
    let operator = '';
    // FIXME: we definitely want to accord special prominence to args that occure before the command-name.
    // e.g `js-hell -Cdir script.mjs` should change to `dir` before trying to resolve `script.mjs`
    let done = false;
    let discard = false;
    let first = true;
    let haveRedirect = null;
    // FIXME: the subshell has access to this the `cwd` var and should use this.
    let cwdForResolveScriptlet;
    const pre = Usage.fromOptionsOnly( PRE_SCRIPTLET_OPTIONS );
    let lastArg;
    /// @brief This avoids `return()` being called on an iterator
    /// in a for-loop. It also does some of the annoying early
    /// passing and spots the termination.
    function* iteratorCopy( ) {
        for ( let first = true;; first = false) {
            const {value:arg,done:complete} = argIterator.next();
            if ( complete ) {
                done = true;
                return;
            }
            // FIXME: this will almost certainly be simpliied by the existence of a true "js-hell" command.
            // And it largely, now, exists (builtins/js-hell.mjs); we just need to graft it into this mess 
            // and deal with the reparsing issue.
            if ( !USE_JS_HELL_SCRIPTLET && jsHellAllowed && arg.type === ARG_POSITIONAL_VALUE && arg.value === "js-hell"
                // There is no reason it has to be first.
                // 1. There could be an option (e.g. `js-hell --stacktrace js-hell cmd`)
                // 2. When this becomes a scriptlet, `js-hell js-hell js-hell` will be legal, if you want.
                // However (FIXME) args after js-hell should be local to that subshell; e.g.
                // `js-hell --stacktrace cmd1 && cmd2` should have stacktrace active for all.
                // but `js-hell js-hell --stacktrace cmd1 && cmd2` should only have it active for the second.
                /* && first*/ ) {
                    // 2024_12_3: We can always reparse if the cmd is js-hell. FIXME: add test.
                    // In fact, this is the only time it should be auto set.
                    reparse = true;
                    versionAllowed = true;
                continue;
            }
            if ( arg.type !== ARG_OPERATOR ) {
                lastArg = arg;
            } else {
                if  ( first ) {
                    // FIXME: This error message is unhelpful. We need to point at the string:
                    // which means arg needs to have a (reconstructed) copy of the source and 
                    // the position. Tokeniser errors can do this.
                    throw new Error( `Operator '${arg.value}' not allowed as first argument` );
                }
                // Some operators can be passed through - e.g. `>x`
                if ( isOperatorCommandDivider( arg ) ) {
                    operator = arg.value;
                    break;
                }
            } 
            yield arg;
        }
    }
    // 2024_11_25: I think this parses through to the first positional. The first positional
    // is saved by `iteratorCopy()` so it can be pushed back onto the stack as is,
    // and the rest of the args read off. Ultimiately these should be
    // options of the js-hell builtin. This is horrible. 
    for ( const desc of pre.rawParse( iteratorCopy( argIterator ) ) ) {
        // NB All these options have to be parsed early. WHEN ADDING ANOTHER OPTION: 
        // ask whether it can be rotated to after the scriptlet name and handled in 
        // `resolveOptions()`?  
        if ( desc.key === KEY_POSITIONAL ) {
            // 2024_11_14: This means a non-literal first argument, which should be
            // ruled out by the above code. No test. 
            if ( typeof lastArg === 'undefined' ) {
                console.log( desc );
                throw new Error( "Internal parse error" );
            }
            result.push( lastArg );
            break; 
        } else if ( desc.key === "stacktrace" ) {
            stacktrace = true;
        } else if ( desc.key  === "inspect" ) {
            inspect = true;
        // FIXME: the very name "redirect" is misleading.
        // 
        // But by far the simplest solution to `help`, `version`, etc... is to insert the relevent
        // command as the first argument.
        } else if ( redirectingOptions.has( desc.optionName ) ) {
            if ( haveRedirect ) {
                // 2024_9_27: Really helpful error, here.
                throw new Error( "Multiple redirects" );
            }
            const cmd = redirectingOptions.get( desc.optionName );
            result.unshift( { type: ARG_POSITIONAL_VALUE, value: cmd, info: INFO_NONE } );
            haveRedirect = cmd;
        } else if ( desc.key === "cwd"  ) {
            // Q: This allows `js-hell -Cdir cmd` so that scriptlet resolution works.
            // But do we really need that?
            // A: Well, the alt is the more vebose `js-hell dir/cmd -Cdir`
            // Also, currently (2024_10_19), `dir/cmd` implies a physical file
            // It does't say find the `package.json` in `dir` and execute `cmd`
            // which `js-hell -Cdir cmd` _ought_ to allow. 
            cwdForResolveScriptlet = desc.value;
        } else {
            // Assertion failure.
            throw new Error( "Intenal error - unknown option should have been caught" );
        }
    }
    // This does two things.
    // 1. It splits it on compound operators. (Shouldn't happen here. That should be a separate pass. )
    // 2. It rewerite options that are shortcuts for commands ("--help") into commands.
    // The last two should be given a sensible name. 
    for ( ;; ) {
        // We can't put it in the for loop because it closes the bloody thing.
        const {value:arg,done:_done} = argIterator.next();
        if ( _done ) {
            done = true;
            break
        }
        if ( arg.type === ARG_NAME ) {
            // `Redirecting` is a misnomer; these are help, etc.. that are rewritten as commands.
            // 2024_9_17: Help, etc... needs to be parsed this early. That is deeply frustrating.
            // 2024_9_27: Should they have a special type, a la `ARG_OPERATOR?`
            if ( redirectingOptions.has( arg.value ) ) {
                if ( arg.info === INFO_HASVALUE  ) {
                    // Q: would `--help=scriptlet` be the end of the world? Well, if it took
                    // an arg, it would be the same as `js-hell --help scriptlet` 
                    // and that's exactly how `js-hell --help scriptlet` behaves now.
                    // (`--help` becomes `help`).
                    console.warn( `${arg.value} doesn't take an argument` );
                    discard = true;
                }
                if ( !haveRedirect ) {
                    const cmd = redirectingOptions.get( arg.value )
                    result.unshift( { type: ARG_POSITIONAL_VALUE, value: cmd, info: INFO_NONE } );
                    haveRedirect = cmd;
                } else {
                    throw new Error( "Multiple redirects" );
                }
            } else {
                result.push( arg );
            }
        } else if ( arg.type === ARG_OPERATOR ) {
            if ( discard )
                throw new Error( "Reached unreachable state" );
            if ( isOperatorCommandDivider( arg ) ) {
                operator = arg.value;
                break;
            } else {
                result.push( arg );
            } 
        } else if ( discard ) {
            discard = false;
        } else {
            result.push( arg ); 
        } 
    }
    
    // Q: Should we reparse if we have had options? i.e. how should we handle `js-hell -C somedir "do some thing"`?
    // The historical behaviour is for --stacktrace, etc... not to count towards determining whether we reprocess. 
    // (Is that overly generous?) But we will be broken if reparsing once -C has been set. 
    
    if ( done && reparse && !operator && result.length === 1 && result[0].type === ARG_POSITIONAL_VALUE && typeof cwdForResolveScriptlet === 'undefined' ) {
        // 2024_10_19: What, if any options, should be allowed before `js-hell 'CLI=1 cmd...'`? I would like nothing.
        // But maybe `--stacktrace` makes sense and is global enough?
           
        let cmdline = result[0].value;
        if ( versionAllowed && cmdline.startsWith( "CLI=" ) ) {
            const startIndex = "CLI=".length;
            const instr = new Instr( cmdline, {pos: startIndex } );
            // This can throw... 
            const version = readVersion(  instr ) ;
            if ( version.major !== 1 || version.minor !== 0 ) {
                throw new VersionError( `Unsupported CLI version (${version.text})` ); 
            }
            cmdline = instr.tail();
        } 
        // 2024_7_22: Inherited test specifically check for `jsHellAllowed: true`; apparently
        // used when we parse package scripts. You'd think in those situations we should require it?
        return parseInvocation( Argtok_fromString( cmdline ), { stacktrace, inspect, jsHellAllowed: true } );
    }
    if ( result.length === 0 ) {
        // So you can't do `js-hell "|" "x"`, say. It has to be genuienly zero.
        if ( head && !operator ) {
            result.push( { type: ARG_POSITIONAL_VALUE, value:  "help" } );
        } else {
            // fIXME: lousy reporting and bonkers that we do this.
            throw new Error( "expected scriptlet name" );
        }
        
    }
    
    if ( result[0].type !== ARG_POSITIONAL_VALUE ) {
        throw new Error( "expected scriptlet name" );
    }
    const node = new Statement( result, {
        cwdForResolveScriptlet,
        stacktrace,
        inspect,
        pipeTail,
    } );
    if  ( !operator )
        return node;
    
    if ( done )  //< e.g. `cmd &&`
        throw new Error( "expected command" );
    
    // Q: Why are we recursively doing this, rather than iteratively?
    // We could then dispense with the horrible manual use of the iterator.
    return new CompoundStatement( 
        node, 
        operator,
        parseInvocation( argIterator, { head: false, pipeTail: operator === '|', jsHellAllowed: true } ) ); 
}


class 
CliTreeWalker {
    #root;
    #node;
    lastJoin = '';
    nextJoin = '';
         
    constructor( root ) {
        this.#node = root;
    }
    
    /*done() {
        return this.#node === null;
    }*/
    
    next( lastResult ) {
        const node = this.#node;
        if ( node === null )
            return { node, pipeTail: false, pipeHead: false };
        this.lastJoin = this.nextJoin;
        if ( this.lastJoin === COMPOUND_AND && lastResult === false ) {
            return { node: this.#node = null, pipeTail: false, pipeHead: false};
        }
        const pipeTail = this.lastJoin === '|';
        if ( node.type === CLI_STATEMENT ) {
            this.nextJoin = '';
            this.#node = null;
            return { node, pipeTail, pipeHead: false };
        } else if ( node.type === CLI_OPERATOR ) {
            this.nextJoin = node.operator;
            if ( node.lhs.type === CLI_STATEMENT ) {
                this.#node = node.rhs;
                return { node: node.lhs, pipeTail, pipeHead: this.nextJoin === '|'  };
            } else {
                throw new TypeError( "Invalid CliNode tree" );
            }
        } else {
            throw new TypeError( "Invalid CliNode type" );
        }
        
    }
    

};
 
const NIL_UUID = "00000000-0000-0000-0000-000000000000"; 
export function
getGlobalDefaults( {
    stdout, 
    EOL: platformLineEnding = process.platform === 'win32' ? '\r\n': '\n',
    sessionId = NIL_UUID,
    env = process.env,
} = {}  ) {
    return {
        EOL: platformLineEnding,
        SCREEN_COLUMNS: stdout?.columns ?? 80,
        expandGlobs:true,
        
        // functions. Some of which trample over our namespace.
        fetch: jshellFetch,
        
        ...path, // basename, extname, dirname, etc... // 2024_9_23: Really?
                
        // Objects - kinda...
        Buffer,
        // Namespaces
        Math,
        Uint8Array,
        console,
        

        // useful utiltiies.
        ...UserUtils,
        env,
        sessionId,
    }; 
}

class 
Shell {
    // Some tests wants custom versions of these functions.
    pwd;           // `process.cwd` function or an overide     
    chdir;         // `process.chdir` function or an overide.     
    
    // We assume a virtual TTY. But we might need to play nice with usual conventions.
    stdout;
    stdin;
    stderr;          // <Stream> Do we need this if we have console?
    console;         // <Console> This is a console instances that writes _exclusively_ to stderr.
    
    // --------
    EOL;         // <String>
    
    constructor(  {
        // These are all process params we are inheriting.
        platform = process.platform,
        cwd:pwd  = process.cwd,
        chdir    = process.chdir ,
        stdin    = process.stdin,   
        stdout   = process.stdout,   
        stderr   = process.stderr,  
        
        // The default console writes to stdout as well as stderr. So we create our own
        // that writes exclusively to stderr. It also has all our extras. But you can
        // override it. 
        // FIXME: we need to respect -d and -q.
        // FIXME: We should be able to control the levels with --log-mask or something
        console = new Console( stderr, 0, { colorMode: "auto" } ), 
        
        EOL  = platform === 'win32' ? '\r\n': '\n', // Not a process param, but.

        
    } = process ) {
        
        Object.assign( this, {
            pwd,
            chdir,
            
            stdout,
            stdin,
            stderr,
            console,
            EOL
        } );
    }
    
    // FIXME: jobs should only be top level jobs.
    async execJob( _argv, { capture, startupDir = this.pwd() } ) {
        
        const {pwd,chdir,stdin,stdout,stderr,EOL} = this;
        // Q: Should we move stacktrace into the console? Or at least stacktrace checking
        // against the current job, as is proposed for cmd prefixes? 
        let stacktrace = true;  // FIXME: This catches intentional throws (parse errors) as well as unexpected
                                // errors. Once again, a sign errors shouldn't be returned via exceptions.
                                
        let error = "throw";    // hangover from when we had _main. 
        
        // We supply version of the web globals `alert`, `prompt`, and `confirm`.
        // They are useful primitives for console apps talking to the user.
        const {alert,prompt,confirm} = UserUtils;
        Object.assign( globalThis, {alert,prompt,confirm} );
        
        // For comptibility with xwh. xwh blocks people sending non version 4 uuids, so scriptlets
        // can be certain this has come form the command line. Using the same one means it can be stored 
        // in a DB, say, so that you can invoke CGI from the CLI without lots of hassle.
        //  
        // It's possible it may make sense to change this - perhaps so subshells or CLI scripts
        // get a common session ID that disposes of when they lose. We will use a non-V4 UUID, though;,
        // probably v8. 
        const sessionId = NIL_UUID; 
        
        try {
            // When launched from the cmdline, this defaults to the cwd (see above) and so is a nop. 
            // But if we are launched as a script, this will be replaced by the script's packagedir.
            // Managing the global variable that is the currently directoy is one of the pain points.
            chdir( startupDir );
            
            const jsHellArgv = _argv.slice( 1 );
            jsHellArgv[0] = "js-hell";
            
            const argtok = Array.from( Argtok_fromArray( jsHellArgv ) );
            // TODO:
            //   The whole of main should now be `new Statement( argtok, {cwdForResolveScriptlet:startupDir} ).exec()` or 
            //   something similar. The first resolve-scriptlet finds the js-hell internal and it works from there.
            //
            //   (Although, currently, the builyin js-hell scriptlet returns a statement. And it may not be bad to have a statement
            //   runner, and an iterator which passes us statements; i.e. CliTreeWalker handles nesting) 
        
            const walker = new CliTreeWalker( parseInvocation( argtok.values(), { reparse: true, jsHellAllowed: true, versionAllowed: true } ) );
            let topic, lastResult;
            let lastPipeHead = false;            
            RUN: for( let {node,pipeHead,pipeTail} = walker.next(); node; {node,pipeHead,pipeTail} = walker.next( lastResult ) ) {
                if ( pipeTail && !lastPipeHead ) {
                    throw new Error( "pipe has a tail but no head" );
                }
                if ( pipeTail ) {
                    topic = lastResult; // lastResult is probably a minsomer, this will have been turned into a topic already.
                } else {
                    // Should this be stdin?
                    topic = stdin;
                }
                stacktrace = node.stacktrace;
                const resolveDir = node.cwdForResolveScriptlet;
                if ( typeof resolveDir !== 'undefined' ) {
                    chdir( resolveDir );
                }
                await node.resolveScriptlet();
                
                const job = new ShellJob( this );
                try {
                    
                    // Should this already be done - as part of resolve? If not, should it, like resolve, store it in the 
                    // node?
                    //
                    // Q: Should this have error capturing and let us know whether it succeeded or failed?
                    node.resolveOptions();
                    
                    if ( pipeTail && node.fileTopicKey === "" ) {
                        throw new TypeError( json_q`cannot pipe to ${node.scriptletName} - it doesn't consume stdin` );
                    }
                    // This has to happen before all relative file options are processed. It's cumulative
                    // with any `-C` that occurs before the command. (Q: should it? Is that a legacy of when
                    // we couldn't stick -C before the cmd? Should it only change after?
                    //
                    // A: It's quite hard to extract a package cmd, without changing to the dir containing 
                    // the `package.json` But we could fix that with sub cmds. `js-hell some-file.json cmd ...`)
                    if ( typeof node.cwd !== 'undefined' ) {
                        chdir( node.cwd );
                    }
                    
                    // This has been set already, probably
                    ({stacktrace} = node); // node.stacktrace defaults to the global value. So it will be reset next time through;
                                           // although there is a window when it inherits this value.
                    const input = !pipeTail ? null : topic, 
                          captureAs = pipeHead?CAPTURE_FILETOPIC:capture?CAPTURE_OPTIONAL_VALUE:CAPTURE_NONE,
                          // 2024_12_20: This is the value that is, I think, passed to `IDL.prototype.getDefaults()`
                          // it will then convert that into the globals for the lexial environment.
                          //  
                          // Anything that isn't in globalDefaults should be, I think, irrelevent.
                          // And anyway, they should be queriably aginst the current shell/job.
                          // We just need the lexicalEnvironemnt code to appreicate that...
                          execOptions = {
                                        stdin,  
                                        stdout,
                                        cwd: pwd(),
                                        // 2024_9_20: `globalDefaults` is a misnomer; these will be the 
                                        // globals. 
                                        globalDefaults: getGlobalDefaults( {stdout,EOL,sessionId } ), 
                                        inspect: node.inspect,  //< Open the inspector.
                                        brk: false,             //< brk triggers the debugger there and then
                                    }; 
                    
                    await job.openLog( node.logfile );
                    const newConsole = job.console;
                    // 2024_12_20: FIXME: make this an arg of getGlobalDefaults or something. 
                    execOptions.globalDefaults.console = newConsole;
                    job.lexicalEnvironmentOptions = execOptions;
                     
                    const {success,value} = await runShellJob( 
                        job,
                        // Q: Should this be `job.exec()` ? Or should `exec()` be passsed
                        // `job` in placse of `execOptions` and pick them up from there?
                        () => node.exec( execOptions, captureAs, input )    
                    );
                    // NB this won't return a result if we pass it CAPTURE_NONE; it will output it. 
                    // formatting and output work. i.e. pipeHead means "capture" or something.
                    if ( success ) {
                        // FIXME: We don't know whose status this is. We might not want to flush.
                        newConsole.statusClear?.();
                        // Should there by a `node.result()` function that handles the result
                        // and processes it into a topic? Even `nextStatment.setInput()`
                        // and a dummy nextStatement for stdout/redir. (a[nti]cat - i.e. save)
                        // Once we have output formatting, this will be true anyway.
                        if ( pipeHead ) { 
                            lastResult = value;
                            lastPipeHead = true;
                        } else if ( capture || typeof value === 'boolean' || typeof value == 'undefined' ) {
                            lastResult = value;
                            lastPipeHead = false;
                        } else {
                            throw new Error( "No result expected" );
                        }
                    } else {
                        // 2024_11_29: Currently only scritplet exceptions are returned this way.
                        // FIXME: Change this.
                        //
                        // FIXME: We don't know whose status this is. We might not want to flush.
                        newConsole.statusFlush?.();
                        node.error( value );
                        return EXIT_SCRIPTLET_EXCEPTION;
                    }
                } finally {
                    // This should catch all errors. We hope.
                    job.finalise({stacktrace});
                    // 2024_11_29: A successful exit will have called `statusClear()` so there
                    // is nothing to flush. A failed exit, may or may not have flushed the status
                    // line; this code does it anyway, to be sure.
                    //
                    // Q: should we register this as finalisation?
                    await job.flushStatusAndCloseLog();
                }
            }
            // 2024_11_30: This is fine. It seems reasonable if we type `$(cmd1 && cmd2)` that it only returns the
            // result of the last command. That is what happens in js itself and what happens for a pipe. (Ditto
            // `$( cmd1 ; cmd2)` if we enable it. `;` is functioning like the `,` operator.)
            //
            // The problem is when we are writing to a TTY and expect all the results to be echoed - the historic
            // norm.
            if ( capture ) {
                return { success: true, value: lastResult }
            }
            return lastResult === false ? EXIT_FAILURE : EXIT_SUCCESS;  
        } catch ( err ) {
            // Q: Should this respect `--log`? i.e. have we closed the console
            // too soon? 
            if ( typeof err.sourceText === 'string' && typeof err.sourceIndex === 'number') {
                // FIXME: Multiline expressions are now very common.  
                console.log( "processing: %s", err.sourceText.replaceAll( /[\r\n]/g, ' ' ) );
                console.log( "processing: %s", '_'.repeat( err.sourceIndex ) + '^' );
            }
            // 2024_10_19: stacktrace starts true (to catch exceptions during development), 
            // which means this can throw up traces that are useless to the user - e.g. a wrong
            // `CLI=x` version. Likewise, it seems unlikey a parse error will ever want a trace. 
            //
            // The fundamental problem is we are using exceptions for error handling, rather
            // than having a true error handling process. (FIXME.)
            //
            // (And yes, `instr.error()` sets `type` to `"parse"`, not `name`, ugh.)
            console.error( "js-hell: %s", stacktrace && err.type !== 'parse' && err.name !== VersionError.name ? err.stack : err.message );
            return EXIT_JS_HELL_EXCEPTION;
        } 
        // We could do `finally{chdir(startupDir)}` but if we are a true process, it shouldn't be ncessary. 
    }
    
    finalise() {
    }

};

// Known use cases:
//   1. From the command-line, via another shell, where we need to manage stdio.
//   2. Scriptlet thats wrapping scripts in package.json - where we want to use the host shell.
//   3. REPL
//   4. Embedded in text editor comamnd-line (electron or nwjs), where we probably don't have stdio (or console?) 
//   and want to return an async iterator of text so it can go into a buffer. We definitely want to isolate scripts
//   in that case. It may even be a postMessage interface where we pass the text as messages.
//
/// @param capture Instead of outputting the results to stdout and returning an exit code, return a result 
/// object (`{success:boolean,value:any}`). 2024_11_29: NB this currently only applies for a successful execution; failures
/// return the exit code. Value is an array of the results in return order, whatever that is. (Your problem...) 
/// However, we have just diposed of formatting options. So if there are formatting options, it will probably be turned into a string.
/// FIXME? Aadd type info?.
export default async function 
main( {argv = process.argv,capture,startupDir,...shellOptions} = {} ) {
    const curJob = getCurrentShellJob(); 
    if ( typeof curJob === 'undefined' ) {
        installConsole();

        // We are a "login" shell---i.e. non-nested---and need to
        // create a root job with the console, as minimum.
        const shell = new Shell( shellOptions ),
              job = new ShellJob( shell, {}, shell.console );
        try {
            return await runShellJob( job, () => shell.execJob( argv, { capture, startupDir } ) );
        } finally {
            console.assert( !job.hasFinalisation(), "The login job should have no registered cleanup." );
            job.finalise();
            // We could, I suppose, be deleting things people are depending on.
            shell.finalise();
            // Should we uninstall the console as well?
        }
    } else {
        console.assert( Object_isEmpty( shellOptions ), "Extra options passed to shell won't be used." ); 
        const shell = getCurrentShellJob().shell;
        // FIXME: assert shellOptions is empty.
        return shell.execJob( argv, {capture,startupDir} );
    }
}




