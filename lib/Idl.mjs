/* Should we be doing this? */
import { fileURLToPath } from 'node:url';
import {WILDCARD_NAME} from "./re.mjs"; // This is effectively constansts for usage.
import Instr from "./Instr.mjs";
import {realiseTo} from "./consts.mjs";

import argtok from "./args/argtok.mjs";
import parseOptions,{SOURCE_CLI,FILE_TOPIC,KEY_POSITIONAL} from "./args/parseOptions.mjs";
import LexicalEnvironment from "./args/LexicalEnvironment.mjs";

import Usage_parse from "./usage/parse.mjs";
import Usage_build,{PLATFORM_HOST,SOURCE_DEFAULT} from "./usage/build.mjs";
import Usage from "./usage/Usage.mjs";
// Does anybody even uses these?
// export {ARG_NONE,ARG_REQUIRED,default as CliOption} from "./usage/CliOption.mjs";
export {NODETYPE_ENUM, NODETYPE_LIST, NODETYPE_LITERAL, NODETYPE_NAMED, NODETYPE_POSITIONAL, NODETYPE_POSITIONAL_VARIANT, NODETYPE_POSITIONAL_WITH_SUFFIX} from "./usage/parse.mjs"; //< FIXME: Not needed.

import Env_parse from "./env/parse.mjs";

import Binding from "./bind/Binding.mjs";
import buildInvocation from "./bind/buildInvocation.mjs";

import Stream from "./types/Stream.mjs";
import Dir from "./types/Dir.mjs";
import {casts as castsAndConstructors} from "./types/registry.mjs";

import murmurhash3_32 from "./utils/murmurhash.mjs";
 
const VAR_INPUT = "input",
      VAR_STDIO = "$-",      // The one argument for using something like `$<`/`$>` is that 
                             // they never conflict with user variables. And we should really be mapping
                             // input onto `$<` and `$-` should be reserved for stdio as a pair.
      VAR_OUTPUT = "output";

export {WILDCARD_NAME};

const TYPE_EXPR = 'expr',
      TYPE_CALL = 'call';

// source of `parseOption()` options.

export {SOURCE_CLI,SOURCE_DEFAULT};
// Should all these be define in `consts`? Main is include us, just to get these.
export {FILE_TOPIC,KEY_POSITIONAL};

// 2022_10_11: These are here until we are passed a type system. 
// These are global constructors that can't be used on the command line.
// e.g you can't do `cmd MAP :: ($1)` But you could do `cmd JSON :: (new Map( $1 ))`
// Q: Why can't we write `cmd MAP`?
// A: Because it's not helpful to the user?
//
// The host adds `
// // Objects - kinda...
//   Buffer,
//   // Namespaces
//   Math,
//   Uint8Array
// ` Should we not do that? Buffer() is a dup, anyway - although it uses the custom math.  
const additionalConstructors = {
    Map, Set,  // Definitely necessary. So you can pass Map and Sets and REGEXP to functions...
    // `Object` // ? Needed `Object.hasOwn()` `Object.assign()`? `Object.is()` Even the `Object()` constructor?
    // Math?
    // RegExp // Should be available on the command line.    
      
    Buffer,  // Probably necessary. But here as a namspace Buffer.from() etc...
    Boolean,
    Error,
    Promise: { all: args => Promise.all( args ) },
    String,  // Has to be there for String.isString() flying monkey.
    Number,  // Has to be here for Number.isNumber(). Lots of other useful stuff, too.
    // 2024_8_18: 
    // We currently cannot add flyingMonkeys to non constructors so we have to create
    // a version of JSON in order to have the currently necessary isJSON.
    JSON: {
        stringify: JSON.stringify,
        parse: JSON.parse,
        
        // 2024_8_18: 
        // It is very costly to check an object is valid JSON. We have to clamber across
        // prototypes and object to anything that couldn't be returned via JSON.parse( ),
        // as well as circular references.
        //
        // That still leaves us with ambiguities around things which have a toJSON()
        // method, where JSON.stringify( JSON.parse() ) would workj. 
        //
        // So we simply wave evrything through.
        isJSON: () => true, 
        [realiseTo]: () => JSON                      
    },  
};

// 2024_5_29: Again, these things should be supplied and not here.
const flyingMonkeys = {
    '%Response.prototype%.buffer(...)': async function() { return Buffer.from( await this.arrayBuffer() ) },
    // 2022_10_15: Mainly for testing iterator prototypes work.
    // 2024_4_26: Now in Chrome. But not in node as of 21.7
    ...typeof Iterator === 'undefined'? {
        '%Iterator.prototype%.map(...)': function*(callback) {
            for ( const value of this ) 
                yield callback( value );
        },
        '%Iterator.prototype%.toArray(...)': function() {
            const result = [];
            for ( const value of this ) {
                result.push( value );
            }
            return result;  
        },
        '%Iterator.prototype%.forEach(...)': function(callback) {
            for ( const value of this ) 
                callback( value );
        }, 
    } : {},
    // FIXME: there are a whole list of things we need to rule out.
    '%String.prototype%.hash(...)': function(seed) {
        const h = murmurhash3_32( Buffer.from( this ), seed )
        console.log( "hash", this, h.toString( 16 ) );
        return h;
    },
    '%String%.isString(...)': s => typeof s === 'string' || s instanceof String,
    '%Boolean%.isBoolean(...)': b => typeof b === 'boolean' || b instanceof Boolean,
    '%Number%.isNumber(...)': n => typeof n === 'number' || n instanceof Number,
};

// How about -. as the dir shortcut. With the '.' kept i.e. -../dir -./dir and (we'd have to add -/etc/ and -\\.\C:\)?  
const  generalOptions = "[(--cwd|-C)=DIR] [(--help|-h)]",
       redirectOptions = "[(--output|-o)=FILE]",
      
       outputOptions = "[--output-format=STR] [--output-text-encoding=(utf8|ucs2)]"
                        // Technically, a pipe opion
                       + "\n[--output-mimetype=STR] -- Set the mimetype. Only neede for pipes. Will normally be defaulted by `--output-format` and shouldn't be override.\n",
       fileListOptions = "[(--recurse|-R)] [--no-recurse]" +
            // 2024_8_12: 
            // The `GLOB_TEXT` here used to be GLOB. But it all got horirbly broken when we
            // gave positionals parity with options.
            // 1. An list of globs should be a a single glob object - so we need a specific constructor that is missing.
            // 2. The FileList can't handle being handled an instanced glob. (Or an array of globs, as it currently is).
            // 3. That leves dependency graph problems with instancing - we have to instance these globs
            // before anything that depends on them - which is every other file list. 
            " [(--exclude|-X)=GLOB_TEXT]...";   
       
       // FIXME, [--eol=STR] [--screen-columns=COUNT] the latter as `--output-width=COUNT`

const platformDefaults = {
    recursive:undefined,
    expandGlobs:true,
    // NB This will be set by the IDL, because it depeneds on stdout which is passed in.
    output:"-",
    outputTextEncoding:'utf8',
    // We Ideally want input to be "-" as well, so we can override it.
    // 2024_12_3: Ithink this is now handled magically elsewhere.
    // input: "-"
};

// FIXME: move these out, but they're linked to the above.
export function
getOutputFormatParams( _rawDictionary )
    {
        // I originally though the outputFormat was a cast. And this would be a type.
        // But `--output-format=file`? It's really an encoding. E.g. ImageData could be
        // `--output-format=png` or `--output-format=jpg`.
        const {outputFormat,outputTextEncoding='utf8',
            outputMimetype,
            // There are no switches for these, but there should be.
            EOL=process.platform === 'win32'? '\r\n' : '\n',SCREEN_COLUMNS: screenColumns = 80,output}=_rawDictionary;
        return {output,format:outputFormat,EOL,screenColumns,textEncoding:outputTextEncoding,mimetype:outputMimetype};
    }


// FIXME: we ought to check all the positional options, as well.
//
// FIXME: in `callback( x ?? y ?? true  )` effectively we have [(--x|--y)] - i.e. one is
// excluded and we should check the bind code reflects that.
function 
checkAllNamedOptionsAreBound( globalsReferencedInTheBinding, allOptions )
    {
        for ( const {key,platform} of allOptions ) {
            if ( !globalsReferencedInTheBinding.has( key ) && !platform ) 
                throw new TypeError( `arg ${JSON.stringify(key)} left unbound` );
        }
    }

function
usesFileList( usage )
    {
        // This should only be the last one, but.
        if ( !usage.hasRecurringPositional() )
            return false;
        const type = usage.getRecurringPositionalType();
        return type.name === 'File' || type.name === '(Dir|File)'
    }

function
anyPositionalCanAcceptStdin( usage )
    {
        for ( const type of usage.enumPositionalTypes() ) {
            if ( type.realiseStdioAs )
                return true;
        }
        return false;
    }

function
defaultInput( usage ) {
    if ( !usage.hasKey( VAR_INPUT ) )
        return;
    const inputOption = usage.getNamedOptionFromKey( VAR_INPUT );
    const {mandatory,optionName,defaultValue,defaultText} = inputOption;
    console.assert( typeof defaultValue === 'undefined', "--input should never have a value default", defaultValue );
    // This genuinely happens in guardian-api. People write `INPUT=xxx` in the environment so it can never default
    // to stdin. This should be a warning to the user - probably in the env. It needs to be tested for in main
    // to determine whether it can hanlde stdin. 
    console.assert( typeof defaultText === 'undefined', "--input should never have a text default" );
    // Input defaults to '-', when used. It still has to be explicitly declared.
    //
    // - NB We initiallise `input` in the global space to stdin, so
    // this breaks that. 
    if ( typeof inputOption.defaultText === 'undefined' ) {
        inputOption.defaultText = FILE_TOPIC;
    }
}
function
handleInput( globalsReferencedInTheBinding, usage ) {
    // FIXME: we need to check the output type is writeable, etc...
    const usesInput = globalsReferencedInTheBinding.has( VAR_INPUT );
    const inputVariable = usesInput ? VAR_INPUT : '';
    let inputOptions = ""; 
    if ( usesInput ) {
        // This should mean `API=1 cmd :: default( await ( @option(File) input ).json() )` works. 
        if ( !usage.hasKey( VAR_INPUT ) ) {
            // Historical quirk: declare input, for it. It will be defaulted to stdin.
            inputOptions = "[--input=FILE]";
        }
    }
    return {usesInput:usesInput?true:false,inputVariable, inputOptions}
}


/// @param[Object] `userSuppliedDefaults` are all the 'env' vars we've already passed. Could we not defer them till here?
function
parse( idl) {
    
    const {api,name,usageAndBinding,defaults:userSuppliedDefaults,summary,details} = Env_parse2( idl ),
          instr = new Instr( usageAndBinding ),  //< FIXME: Env_parse2 should be able to use the instr and return it.
          usage = Usage_parse( instr, name ),                   //< The `usage` is the unmunged AST.
          
          binding = Binding.from( instr );
          // Historic: just in case it turns up. 
          Object.defineProperty( binding, 'output', { get: () => { throw new Error( "Acccessed binding.output" ) } } ); 
    binding.remapGlobals( VAR_STDIO, VAR_INPUT );

    // The usage without any platform options.
    // The reason that building usage is two phase is because
    // it needs stuff from the binding. We need to fix this so it can be added
    // later.
    const rawUsage = Usage_build( usage,
        userSuppliedDefaults,
        binding.globalsWithLiteralDefaults(),
        binding.inlineOptions, 
    );
    
    let platformOptions = generalOptions;
    
    if ( !binding.void ) {
        platformOptions += ' ' + redirectOptions;
        platformOptions += ' ' + outputOptions;
    }
    if ( usesFileList( rawUsage ) ) {
        platformOptions += ' ' + fileListOptions;
    }
    
    const globalsReferencedInTheBinding = binding.globals
    const {usesInput, inputVariable, inputOptions} = handleInput( globalsReferencedInTheBinding, rawUsage );
    binding.usesInput = usesInput;
    if ( inputOptions ) {
        platformOptions += " " + inputOptions;
    }
    const usageObject = rawUsage.addOptions(
        Usage.fromOptionsOnly( 
            platformOptions, "platform",
            // These include our defaults, and can be defaulted by the user.
            userSuppliedDefaults,
            // I'm not sure abou these, though...
            binding.globalsWithLiteralDefaults(),
        ),
    );
    // Dependent on saneOptionsFromKey
    defaultInput( usageObject );
        
    checkAllNamedOptionsAreBound( globalsReferencedInTheBinding, usageObject.enumAllOptions() );
    const hasStdinReplaceables = anyPositionalCanAcceptStdin( usageObject );
    return {
        api,
        name,                                //< The name as return via the env parser or `$0`.
        binding,
        inputVariable,
        summary: summary ?? '',                 //< First paragraph of API annotation or the annotation attached to $0. 
        details,                                //< Remaining paragraphs of API annotation.
        platformOptions,
        hasStdinReplaceables,                  //< i.e. '-' is availble for input.
        hasStdoutReplaceables: !binding.void,  //< 2024_6_5: this is not used and shoul dbe replced. 
        userSuppliedDefaults,                  //< i.e. the "env" vars provided at the start of the usage prior to the command name.
        usageObject
        
    };
}

// 2022_10_25: Used by the call internal command.
// Probably handy to write js from the commandline.
// Needs to be kept in sync (and shared) with nomral eval.
// Need a way to inherit all our commands.
export function 
evaluate( bindingText, globalDefaults = {})
    {
        const binding = Binding.from( new Instr( bindingText ) );
        const defaults = Object.assign( 
            {}, 
            platformDefaults,
            // FIXME: this is not something we should be doing. But the whole TypeSystem should be provided to us.
            castsAndConstructors, additionalConstructors, flyingMonkeys,  
            globalDefaults,
            // FIXME: it would be nice to have all of these inheritted. 
            /*{
                cwd: Dir.fromFullPath( initialDir ), 
                output: stdio,
                '$-': stdio
            }*/ 
        );
        const {name,args,result} = buildInvocation( binding, new Map( Object.entries( defaults ) ) );
        return {name, args};
    }
    
function
Env_parse2( idl ) {
    const {api,name,idl:usageAndBinding,summary,details,...defaults} = Env_parse( idl, { extractName: true } );
    // 2024_4_15: The use of `idl` as a key is a historic quirk to be deleted.
    return { api,name, usageAndBinding, idl:usageAndBinding, summary, details, defaults };
}

/// @brief Extract the module name from the IDL.
// FIXME: this should definitely be available in the IDL object and only in the IDL object.
export function
getModuleName( fullIdl )
    {
        // 2024_4_13: FIXME: this should have the name, so there should be no need to do this.
        if ( fullIdl instanceof Idl ) 
            return fullIdl.name;
        return Env_parse2( fullIdl, { extractName: true } ).name;
    }


/// @brief This works on a scriptlet to extract the url.
/// Completely the wrong way around.
function 
toScriptDir( _moduleUrl )
    {
        try {
            return _moduleUrl ? fileURLToPath( new URL( '.', _moduleUrl ) ) : undefined;
        } catch {
            // Q: Should we return '.' in the case of failure?
            // A: No, let the higher levels work out how to default this.
        } 
    }

function
toModule( moduleOrFunction ) {
    if ( typeof moduleOrFunction !== 'function' ) 
        return  moduleOrFunction;

    if ( typeof moduleOrFunction.name === 'string' && moduleOrFunction.name !== '' ) {
        return { default: moduleOrFunction, [moduleOrFunction.name]: moduleOrFunction };
    } else {
        return { default: moduleOrFunction}; 
    }
}
/// @brief Return an object containing all the imports, or null if they can't be satisified. 
function
getImports( imports, module, throwMissing = false ) {
    if ( typeof imports === 'string' || typeof imports === 'symbol' ) {
        const importName = imports, 
              entryPoint = module[importName];
        return typeof entryPoint === 'function' ? {[imports]:entryPoint} : null;
    } else if ( Array.isArray( imports ) ) {
        // FIXME: we need to deduce which are functions and which are values.
        // Globals are either in TYPE_CALL or TYPE_LOOKUP, so we easily deduce this.
        const result = {};
        for ( const name of imports ) {
            if ( !Object.hasOwn( module, name ) ) {
                if ( !throwMissing )
                    return null;
                throw new Error( `Module doesn't have an export called ${JSON.stringify( name )}` );
            }
            result[name] = module[name];
        }
        return result;
    } else {
        throw new TypeError( "Invalid imports in binding" );
    }                                       
}


/// @brief Returns the AST for the usage and the binding.
export default class
Idl {
    #idlText;                //< This is the actual idl as text.
    get text() { return this.#idlText }
    #binding;                //< Binding:
    #usage;                  //< Usage: 
    #name;                   //< This is the name given in the IDL. (The "internal" name.) It should be "$0" or match the external name.
                             //  This is currently inserted into the usage as $0. That can be done away with.
                       
    
    inputVariable;           //< One of VAR_INPUT, VAR_STDIN, or '' if neither are referenced. 
    
    summary;
    details;
    get platformOptions() {
        throw new Error( "Platform options not supported any more" );
    }
    
    globalDefaults = null;   //< 2024_3_22: A historic quirk to be removed. It's not needed till instantiation. 
    hasStdinReplaceables;
    hasStdoutReplaceables;
    userSuppliedDefaults;    //< the env vars: those releated to switches should have been merged into vars. But others are possibe... 
    __dirname;
    
    get name() { return this.#name }
          
    
    // 2024_3_22: FIXME: globalDefaults to be completely removed from here. 
    constructor( idlText, globalDefaults = {}, moduleUrl ) {
        if ( idlText instanceof Idl )
            throw  new TypeError( "Copy!" );
        if ( typeof idlText !== 'string' )
            throw new TypeError( "IDL should be string now" );

        // Q: Should this be provided to us either via the scriptlet or via the host?
        // A: Yes, as part of globalDefaults.
        // 2024_3_22:  Q: Is this even needed, when any module has import.meta.url?
        // Or is this now superseeded - it's not set in many cases.
        const __dirname = toScriptDir( moduleUrl );
        // All static checks should happen somewhere in here.
        const { api, name, binding, inputVariable, summary, details, platformOptions,hasStdinReplaceables,hasStdoutReplaceables, userSuppliedDefaults, usageObject} = parse( idlText );
        const SUPPORTED_VERSION = 1;
        if ( api !== -1 && api !== SUPPORTED_VERSION ) {
            if ( typeof api === 'undefined' ) {
                throw new TypeError( `Module's js-hell declaration is invalid (it's missing an \`api\` key)` );
            } else if ( typeof api !== 'number' ) {
                throw new TypeError( `Module's js-hell declaration is invalid (the \`api\` key must be a number)` );
            } else {
                throw new TypeError( `Module uses an unsupported API version (version ${SUPPORTED_VERSION} is required, but script is version ${api})` );
            }
        }  
        // Oh for parse( idl ).{descriptor, namedOptions, positionalOptions, binding, usageStr, platformOptions, globalDefaults};
        Object.assign( this, {
            summary, details, globalDefaults, 
            hasStdinReplaceables, hasStdoutReplaceables, userSuppliedDefaults,
            inputVariable,
            __dirname
        } );
        
        
        this.#idlText = idlText;
        this.#binding = binding;
        this.#usage = usageObject;
        this.#name = name;

    }
    
    validateModule( moduleOrFunction ) {
        return !!getImports( this.#binding.name, toModule( moduleOrFunction ) );
    }

    /// @brief Return the `defaults` dictionary used to `createLexicalEnvironment()`
    getDefaults({ stdout = process.stdout, stdin = process.stdin, cwd: initialDir = process.cwd(), globalDefaults: perInstanceGlobalDefaults = {} } = {} ) {
        // FIXME: can a stream object not be passed to us.
        const stdio = new Stream( stdin, stdout );
        
        const {globalDefaults:constructorGlobalDefaults,userSuppliedDefaults,__dirname} = this;
        // This is the initialiser for the lexical environment: i.e. these are all the things visible in the "javascript" RHS of the IDL.
        return { 
              
              // Things like `--cwd`, `--output`, etc... See above.
              ...platformDefaults,
              // The user cannnot overide `--output` or `--cwd` because of below. But they can override much else.
              // NB the `namedOptions`, which include the default if it matches, are passed to LexicalEnvironment -
              // 2024_4_17: which means, for those that aren't arbitrary vars, this is redundent, right? They will 
              // all be defaulted via that and don't need to be globally availale.
              ...userSuppliedDefaults,
              // FIXME: these is not something we should be having opinions on. The whole TypeSystem should be provided to us.
              ...castsAndConstructors, ...additionalConstructors, ...flyingMonkeys,
              // 2024_3_22:   
              // The host uses `perInstanceGlobalDefaults` to provide sensible globals (like SCREEN_OLUMNS)
              // as well as bits of the type system (e.g. our revised Math) 
              ...constructorGlobalDefaults, ...perInstanceGlobalDefaults,
              
              cwd: Dir.fromFullPath( initialDir ),
              output: stdio,  //< This is the default value for `--output`, if none is provided. Putting it here means the script can see it.
              '$-': stdio,    // Relationsip with inputFile
              input: stdin, 
              // This is here as hack so mjs scripts that are processing default files relative to their
              // path can find those files.
              // 2024_3_22: Seems to be superseeded by `import.meta.url`. It's largely redundent and I don't
              // know of any scripts that need it. Except we don't make import.meta.url available in the binding,
              // and this is.
              // Q: Is this import.meta.url or is it the PackageTree dir or something else?
              __dirname: typeof __dirname === 'string' && __dirname ? Dir.fromFullPath( __dirname ) : undefined,
          };
    }
    
    createLexicalEnvironment( args ) {
        // 2024_9_20: The `getDefaults()` is historical baggage that should probably be elsewhere.
        return new LexicalEnvironment( this.#usage, this.getDefaults( args ) );
    }

    getUsage( extraOptions = "", operatorsToOptions = {} ) {
        // We can't cache this because of the defaults. Aghhh.
        const usage = extraOptions === "" ? this.#usage 
                    : this.#usage.addOptions( Usage.fromOptionsOnly( extraOptions, "host" ) )
                    .addOperators( operatorsToOptions );
        return usage;
    }

    /// @brief Return the list of option NAMES which conflict.
    getOptionConflicts( optionsString ) {
        return this.#usage.getConflictingOptions( Usage.fromOptionsOnly( optionsString, "host" ) );
    }
    
    parseOptions( argv, extraOptions = "" ) {
        return this.getUsage(extraOptions).parseOptions( argv );
    }                     
    
    // 2024_6_1: _main, has been removed. It's been replaced either with CommandLine
    // or in main.
    //     
    // 2024_4_19: Q: Why is this in IDL. Should this not be in scriptlet.
    // A: Because of instantiate and Scriptlet is not global. But I think 
    // moving both out would make sense so `Scriptlet#exec` becomes a susbtitute for
    // _main().
    //
    // Q: We don't return the full result because testing is easier if we can access the full
    // result before it is saved. That differentiates us from main(). 
    async _exec( moduleOrFunction, shellArgArrayOrString, options = {} ) {
        
        const lexicalEnvironment = this.createLexicalEnvironment( options );
        lexicalEnvironment.appendParsedOptions( this.parseOptions( argtok( shellArgArrayOrString ) ) ); 
        const _rawDictionary = lexicalEnvironment.finalise(); 
        // 2024_6_17: I'm not sure this await should be here. But all the tests
        // fail without it. They all need moving over to the `_exec1` anyway.
        const result = await this._exec1( moduleOrFunction, _rawDictionary, options );
        //
        // 2024_6_3: FIXME: we have to return the rawDictionary because
        // it contains host params resulting to output.
        //
        return {
            result,
            _rawDictionary
        };
    }
    
    async _execParsed( moduleOrFunction, argtail, options = {} ) {
        const lexicalEnvironment = this.createLexicalEnvironment( options );
        lexicalEnvironment.appendParsedOptions( this.parseOptions( argtail ) ); 
        const _rawDictionary = lexicalEnvironment.finalise(); 
        return this._exec1( moduleOrFunction, _rawDictionary, options );
    }

    // 2024_4_19: Q: Why is this in IDL. Shouldn't this not be in scriptlet?
    // A: Still some hacks that need removing, for starters.
    async _exec1( moduleOrFunction, _rawDictionary, {brk = false,inspect = false} = {} ) {
        const binding = this.#binding;
        const module = toModule( moduleOrFunction );
        // Should this check be done by the binding, anyway?
        const imports = getImports( binding.name, module, true ); // getImports is a bad name.
        if ( !imports ) {
            throw new TypeError( "Module's entry point is missing or not a function" );  
        }
        // FIXME: in `with()` mode, the action has already happened.    
        if ( inspect || brk ) {
            const {default:inspector} = await import( "node:inspector" );
        }
        return binding.exec( new Map( Object.entries( _rawDictionary ) ), imports, {legacyBrk:brk} );
    }  
    
    toString() {
        // 2024_3_25: Needed for the `js-hell resolve --idl`
        return this.#idlText;
    }

    /*option_hasDefault( name ) {
        return this.#binding.hasDefault( name );
    }
    option_getDefault( name ) {
        return this.#binding.getDefault( name );
    }*/

    
    isInputUsed() {
        return this.inputVariable !== '';
        // return this.#binding.usesInput; 
    }
    
    /// @brief If all uses of the input variable make the same method call, return that method.
    /// e.g. if everybody goes `$-.toJSON()` return 'toJSON';
    inputUsedWithMethodCall() {
        const v = this.#binding.getGlobal( this.inputVariable );
        if ( v && v.othersCount === 0 )
            return v.methods;
        return null;
    }

    canGuaranteeNoOuput() {
        return this.#binding.void;
    }
    getResultType() {
        return this.#binding.cast;
    }
    
    getCliMap() {
        return this.#usage.getCliMap();
    }
    
    /// @brief Return an iterator over thepositional options: this will be the original 
    /// AST nodes. (FIXME: we need something like namedOption for them.) This is used
    /// for help - which needs to reconstruct the tree.
    ///
    /// NB This EXCLUDEs $0.
    getPositionalList() {
        return this.#usage.enumPositionalAstNodesExcluding$0();
    }
    /// @brief Hack until "...ARGS" is in the usage parser. (And we don't want it there
    /// for now because of how special it is.)
    addTail() {
        this.#usage.addTail();
    }
};


