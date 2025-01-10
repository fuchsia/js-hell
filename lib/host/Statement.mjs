import resolveScriptlet from "./resolve.mjs";
import {ARG_POSITIONAL_VALUE} from "../args/argtok.mjs";
import {getOutputFormatParams,KEY_POSITIONAL,SOURCE_DEFAULT} from "../Idl.mjs";
import {createTopicWrapper2,setOutput2} from "./TopicWrapper.mjs";
import Stream from "../types/Stream.mjs"; // FIXME: remove this, please.
import json_q from "../utils/json_q.mjs";
import {HOST_OPTIONS,SYNTACTIC_SUGAR} from "./hostOptions.mjs";

// const pre = Usage.fromOptionsOnly( PRE_SCRIPTLET_OPTIONS );

export const 
CLI_STATEMENT = 'Statement';

export const
// CAPTURE_VALUE = 'value',
CAPTURE_OPTIONAL_VALUE = 'value',  //< Return the actual result value, or undefined it it's been redirected.
CAPTURE_NONE = false,              //< Write the value to stdout...
CAPTURE_FILETOPIC = true;          //< Return the value as a filetopic.

/// @brief A command line statement. (Probably not a "job" or a "CommandLine" since each can be multiple statements.)
///
/// This goes through multiple state: 
///     1. parse state
///     2. resolve scriptlet state
///     3. resolve options state
///
/// Q: Should this be broken up, so `resolveScriptlet()` returns a new object? which can be used 
/// to resolve the options, etc... rather than doing it all in here? (i.e. we can be run multiple
/// times).   
export default class 
Statement {
    type = CLI_STATEMENT;
    cwdForResolveScriptlet; //< <string|undefined>: This will be a `-C` option before the scriptlet; so it sets the dir
                            // for the `resolve()` call, and potentially, for `resolveOptions()` if not overridden.
                            // (Could be defaulted to startupDir?)
    argv;                  //< All of CLI: in the format provided by argtok(). 
                           // NB $0 is overwritten with `scriptlet.name` during `resolveScriptlet()`
    scriptletName;         //< string: The (string value) of first positional arg in the command line.
    scriptlet;             //< Scriptlet: resolveScriptlet() on above, once resolve called.
    module;                //< Module: cached result of `scriptlet.importModule()`
    usage;                 //< The scriptlet's usage, augmented with HOST_OPTIONS.
    pipeTail;              //< Input is being passed to us. (Error, this makes no sense.)

    // These can be set before resolveOptions(), and adjusted afterwards:.
    stacktrace;             
    inspect;

    // These are extracted from argv and set via `resolveOptions()` 
    logfile;                //< <string|undefined>: The filename.
    cwd;                    //< This is cwdForResolveOptions (and then run).
    optionEntries;
      
    constructor( argv, {cwdForResolveScriptlet,stacktrace,inspect,pipeTail} ) {
        Object.assign( this, {
            cwdForResolveScriptlet,
            scriptletName: argv[0].value, 
            argv,
            stacktrace,
            inspect,
            pipeTail,
        } );
    }

    
    async resolveScriptlet() {
        // Expect a literal, here.
        if ( this.argv[0].type !== ARG_POSITIONAL_VALUE )
            throw new Error( "Internal error ($0 should be a literal)" );
        
        this.scriptletName = this.argv[0].value;
        const scriptlet = await resolveScriptlet( this.scriptletName );
        // We can no longer know this.
        if ( false && this.pipeTail && !scriptlet.idl.isInputUsed() ) {
            throw new TypeError( `cannot pipe to ${this.scriptletName}` ); 
        }
        
        const module = await scriptlet.importModule();
        // FIXME: we could know with doing where the options were in the IDL.
        const conflicts = scriptlet.idl.getOptionConflicts( HOST_OPTIONS );
        if ( conflicts.size ) {
            throw new TypeError( json_q`scriptlet ${this.scriptletName} cannot use options ` + Array.from( conflicts ).map( n => JSON.stringify(n) ).join( ' ' ) );
        }
        const usage = scriptlet.idl.getUsage( HOST_OPTIONS, SYNTACTIC_SUGAR );
        
        // Attempt strong gurantee: don't do anything permanent till all has succeeded.
        // (Except scriptet.importModule() etc... do make chanegs.) 
        this.scriptlet = scriptlet;
        this.argv[0].value = scriptlet.name;
        this.module = module;
        this.usage = usage;
    }
    
    resolveOptions() {
        const {argv,usage} = this;
        const parsedOptions = [];
        let cwd; // This should initially be startupdir, or `-C` to js-hell.
        let positonable = 0;     
        let logfile;
        let {stacktrace,inspect} = this;
        // This can trigger errors for missing or duplicate options.
        for ( const option of usage.parseOptions( argv ) ) {
            const {key,value,source} = option;
            //  
            // - 'cwd' is added as platform options via the IDL. (2024_7_24)
            if ( key === 'cwd' ) {
                cwd = value;
            } else if ( key === 'log' ) {
                logfile = value;
            } else if ( key === 'stacktrace' ) {
                // 2024_8_8: Another flaw: it overrides our default with the hard coded one.
                if ( source !== SOURCE_DEFAULT )
                    stacktrace = value;
            } else if ( key === 'inspect' ) {
                if ( source !== SOURCE_DEFAULT )
                    inspect = value;
            } else {
                parsedOptions.push( option );
            }
            if ( key === KEY_POSITIONAL ) {
                // Q: Should parseOptions track this? (For all list items?)
                positonable++;
            }
            
        }
        Object.assign( this, {
            optionEntries:parsedOptions,
            cwd,
            stacktrace,
            inspect,
            logfile 
        } );
    }
    
    
    /// @brief Create a lexical environment and execute the scritplet
    /// and output any params to stdout (unless @param `pipeHead` is false). 
    ///
    /// @return `{ boolean success, any value }`
    ///
    /// 024_11_29: @NOTE WHile this is being moved over to safe call, it can still
    /// throw.
    /// 
    /// Q: Should we separate out the error conditions and have codes rather than
    /// a generic bool, and then leaving the user to try and understand the error.
    async exec( lexicalEnvironmentOptions, capture = false, topic = null ) {
        if ( ![CAPTURE_OPTIONAL_VALUE,CAPTURE_NONE,CAPTURE_FILETOPIC].includes( capture ) )
            throw new TypeError( "Invalid value for capture" );
        const {scriptlet,argv,pipeTail,optionEntries} = this,
              {idl} = scriptlet;
        
        const lexicalEnvironment = idl.createLexicalEnvironment( lexicalEnvironmentOptions );
        // Q: What errors can these throw?
        lexicalEnvironment.setFileTopic( topic );
        lexicalEnvironment.appendParsedOptions( optionEntries );
        if ( pipeTail && !lexicalEnvironment.usesFileTopic()  ) {
            // ARGV error?
            throw new TypeError( json_q`cannot pipe to ${this.scriptletName}` );
        }
        const _rawDictionary = lexicalEnvironment.finalise();
        // 2024_11_29: The aim, going forward, is --output-format will select a command to pipe to
        // and all the args be forward to that. But that turns us into an implicit pipe. So we
        // either to pull those args early. (Can we extract them from optinsEntries? *before*
        // we create the _rawDictionary - i.e modify this to do it after resolveOptions())
        const formatParams = getOutputFormatParams( _rawDictionary ),
              resultType = this.getResultType(),
              // 2024_8_15: output is currently defaulted to a `Stream` instance by Idl; this is a 
              // legacy of the past behaviour when we tried to make two half duplex streams appear
              // like full duplex file.
              //
              // FIXME: the combined Stream makes no sense now we are handling input via the FILE_TOPIC. 
              // FIXME: output should default to the FILE_TOPIC as well and we should handle it.
              hasOutputCliOption = !( formatParams.output instanceof Stream );  

        
        if ( !idl.canGuaranteeNoOuput() ) {
            if ( capture !== CAPTURE_NONE && capture !== CAPTURE_OPTIONAL_VALUE && hasOutputCliOption ) {
                throw new TypeError( "cannot use `--output` inside a pipe" );
            }
        }
        if ( typeof formatParams.format !== 'undefined' && capture === CAPTURE_OPTIONAL_VALUE ) {
            throw new TypeError( "cannot use --output-format in a subshell (pipe and format)" );
        } 
        let resolvedResult;
        try {
            // FIXME: get _exec1 etc.. to return an abrupt exit,
            // rather than throw. 
            resolvedResult =  await idl._exec1( 
                this.module,
                _rawDictionary,
                lexicalEnvironmentOptions 
            );
        } catch( exception ) {
            if ( exception.name !== "ScriptletError" || typeof exception.cause === 'undefined' ) {
                throw exception;
            }
            // Q: Should we make the `this.error()` call?  
            return { success: false, value: exception.cause };
        }
        // Q: Are there output formats (like `--output-format=boolean`) that this
        // should be true for? 
        // Q: Should `--output-format=boolean` (or another option?) coerce its results 
        // into a boolean and use the boolean pathway? 
        const outputIsStrictBoolean = typeof resolvedResult === 'boolean' 
                                      && typeof formatParams.format === 'undefined'; 
        if ( outputIsStrictBoolean ) {
            if ( hasOutputCliOption ) 
                throw new TypeError( "cannot save boolean output" );
            // Capture OPTIONAL_VALUE has already been handled.
            if ( capture !== CAPTURE_NONE && capture !== CAPTURE_OPTIONAL_VALUE )
                throw new TypeError( "cannot pipe boolean output to a command" );
            return { success: true, value: resolvedResult };
        } else if ( resolvedResult == undefined  ) { // Yes, '==' - for undefined and null.
            if ( hasOutputCliOption ) 
                throw new TypeError( "Command has no output to save" );
            if ( capture !== CAPTURE_NONE && capture !== CAPTURE_OPTIONAL_VALUE ) 
                // FIXME: there should be a switch which enables outputting booleans.  
                throw new TypeError( "cannot pipe command as it has no output" );
            return { success: true, value: resolvedResult }
        } else { 
            if ( capture === CAPTURE_NONE ) {
                setOutput2( formatParams, resultType, resolvedResult );
                return { success: true, value: undefined };
            } else if ( capture === CAPTURE_OPTIONAL_VALUE ) {
                // 2024_12_20: Should this return the resultType and formatParams? Then the caller
                // could handle it in all cases? Ultimately, a result which isn't intercepted,
                // should be returned to the host shell to output to it's "tty".
                return { success: true, value: resolvedResult };
            } else if ( capture === CAPTURE_FILETOPIC ) {
                return { success: true, value: createTopicWrapper2( formatParams, resultType, resolvedResult ) };
            } else {
                throw new Error( "Illegal value for `capture`" );
            }
        }
    }

    /// @brief This is used in the host error reporting for **ScripletError** only.
    error( exception ) {
        // N.B. This should be going through our console (i.e. saved to any logfile)
        // because it's a dynamic error generated in the user's javascript and so
        // should happen before the error stream is closed. (Add check.)
        //
        // Q: should this call console.statusFlush? (Currently it's handled by the
        // error code.
        //
        // Q: Do we want to remove the js-hell fra,es? Currently we are always called
        // via `buildCall()` so we could spot that (modulo minification woes)
        // and end the trace there? It would be a lot more useable. Or node is 
        // including the url of the scriplet, so we could find the last line
        // referencing that, and stop there. Anything really. 
        if ( !this.stacktrace ) {
            console.error( "%s: %s", this.scriptletName, exception.message );
        } else {
            console.error( "%s: %s", this.scriptletName, exception.stack );
        }
    }

    howIsInputConsumed() {
        // FIXME: if input is bound to a fixed key (not a list) we could still decipher it.
        // FIXME: use fileTopicKey, not input.
        const methods = this.scriptlet.idl.inputUsedWithMethodCall();
        if ( !methods || methods.size !== 1 )
            return '';
        
        return methods.values().next().value; 
    }
    
    getResultType() { return this.scriptlet.idl.getResultType() }

    static get type() {
        return CLI_STATEMENT;
    }
};




