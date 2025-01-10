import json_q  from "../utils/json_q.mjs";
import {explicitlySetVariables,realiseTo} from "../consts.mjs";
// Should this be in consts? Or is it local to us?
import {FILE_TOPIC,INSTANTIATE_VIA_LOOKUP} from "./parseOptions.mjs";
// 'Effin' annoying to have this cross link. It's not clear how to avoid it (and it probably needs to be in parseOptions anyway, as well.)
import Binding from "../bind/Binding.mjs";

const REVERT_FILE_TOPIC_TO_TEXT = '-';
  
function 
constructType( type, value, name, {cwd} )
    {
        if ( typeof type.is === 'function' 
            && !type.is( value ) ) 
        {
            if ( typeof name === 'number' )
                name = '$' + name;
            // FIXME: we should we dump the list of possible values for enums.
            if ( type.enum || type.literal ) {
                throw new TypeError( `Invalid value ${JSON.stringify(value )} for ${name}` );
            } else {
                throw new TypeError( `Cannot convert ${JSON.stringify(value)} to ${type.name} for ${name}` );
            }
        }
        return type.fromString( value, {cwd} );
    }

function 
constructList( type, values, name, key, {recurse,cwd,exclude} )
    {
        if ( typeof type.createListFromStringsAndInstances === 'function' ) 
            return type.createListFromStringsAndInstances( values, {recurse,cwd,exclude} );
        // Q: Should this be supplied as a default to the type?
        const result = [];
        for ( let i = 0; i < values.length; ++i ) {
            // Should we allow a symbol here? Maybe a map from symbols to instantiated values?
            if ( typeof values[i] === 'string' ) {   
                result.push( constructType( type, values[i], `${name}[i]`, {cwd} ) );
            } else {
                result.push( values[i] );
            }
        }
        return result
   }

function
Expr_parse( text ) {
    return Binding.from( text, { expr: true } );
}

class 
LexicalEnvironmentReadOnly
{
    #dictionary;
    constructor( dictionary = {} )
        {
            this.#dictionary = dictionary;
        }

    get( name ) { return Object.hasOwn( this.#dictionary, name ) ? this.#dictionary[ name ] : undefined }
    has( name ) { return Object.hasOwn( this.#dictionary, name ); }
    // get size() { return this.#dictionary.size }
};

/** @brief This class handles instantiation of arguments. And creates the dictionary that will hold
them. (The goal is it probably handles defaulting, since Usage doesn't want to do that.) `LexicalEnvironment`
is probably a misnomer; it's currently the global scope (and, hopefully, will one day be a SCOPE_OPTION
so we aren't influenced by globals.)
*/
export default class 
LexicalEnvironment
{
    // 2024_4_18: Can we move these over to private variables and get rid of the readOnly version?
    present = new Set;    //< Values that are explicitly set, rather than relying on default.
    rawDictionary;
    #fileTopicKey;      //< string|uint|void The key or raw positional index of the file topic, or undefined.
    #fileTopic;
    #usage;
    #$;                 //< string[]: The array of key names for the '$' argument.
    #lookups = [];      //< array<{key,type,optionName,optionValue,expr,index}>: Hack for `${}`: these variables will need replacing.
    #finalised = false; //< boolean: Has `finalise()` been called? 
    
    setFileTopic( topic ) {
        if ( typeof this.#fileTopic !== 'undefined' ) {
            throw new TypeError( "Cannot overwrite file topic." );
        }
        this.#fileTopic = topic;
    }
    
    constructor( usage, defaults = {} )
        {
            this.#usage = usage;
            this.rawDictionary = {
                        $:undefined,
                        $LEXICAL_ENVIRONMENT$:undefined,
                        cwd:undefined,        
                        ...defaults,
                    };
        }
    
    has( key ) {
        return this.present.has( key );
    }
    
    // 2024_10_3: Binding.exec() wants a map. So we take rawDictionary, and create
    // a map from it. This enables us to start crossing that divide by making us
    // appear as a map. But it's not yet used. We use this for evalling our own
    // lookups.
    //
    // The current issue with this, is that has() hinds a lot of keys where
    // it needs to return them. 
    /*get( key ) {
        if ( !this.#finalised )
            throw new Error( "Cannot read variables until finalised!" );
        return this.rawDictionary[key];
    }*/
    
    // Private methods are implemented in a suspect way. (Per object, not per prototype?) But needs must.
    #defineProperty( key, { value, get } ) {
        this.present.add( key );
        // Should we allow set as well?
        if ( typeof get === 'function' ) {
            if ( typeof value !== 'undefined' )
                throw new Error( "Cannot specifier accessor and value" );
                Object.defineProperty( this.rawDictionary, key, {get,configurable: true,enumerable:true} );
        } else {
            if ( typeof get !== 'undefined' )
                throw new Error( "Getter must be undefined or a function" );
            Object.defineProperty( this.rawDictionary, key, {value,configurable: true, writable:true,enumerable:true} );
        }
    }

    /*_create( key, value  )
        {
            this.#defineProperty( key, {value} );
        }*/
                    
    _useFileTopic( key, realiseFileAs ) {
        if ( typeof this.#fileTopicKey !== 'undefined' ) {
            // 2024_7_29: e.g. calling `API=1 json-swallow :: default( input.json() )` as
            // `json-swallow -`.
            // We are too early with this error. 
            throw new Error( json_q`the file topic (\`-\`) can only be used ONCE in the command line (already set via ${this.#fileTopicKey}) while setting ${key}` );
        }
        if ( typeof this.#fileTopic === 'undefined' ) {
            throw new Error( json_q`the file topic (\`-\`) not available` ); 
        }
        this.#fileTopicKey = key;
        // 2024_12_1: The prime user of this, at the present, is `Json|JsonFile` (but JSON
        // also enables it; `-` is not valid JSON, so that seems fair). Arguably, it's a work
        // a round for not being able to use `%`. But, at least, where FILE is accepted it's
        // reasonable that the file topic is accepted. And it makes sense to then to hnadle
        // the discriminated union by realising the file as the true type.
        if ( typeof realiseFileAs !== 'undefined' )
            this.#fileTopic[realiseTo] = realiseFileAs;
        return this.#fileTopic;
    }
    
    appendKeyValue2( key, optionValue, instantiated, list, optionName ) {
        // Historic hack: After we've done $1, $2, etc.. We pass the whole lot
        // as an ray...
        if ( key === '$' ) {
            if ( typeof this.#$ !== 'undefined' )
                throw new Error( "Invariant: '$' can only be set onced" );
            // These are all really invariants. Paranoid to check them.
            if ( list !== true || typeof instantiated !== 'undefined' || optionName !== '$' )
                throw new Error( "Internal error (incorrect params for '$')" );
            this.#$ = optionValue;
            return;
        }
        // Ideally we want a seperate `#usage.getTypename(key)` that returns this for us.
        const {typename,type,recurs} = this.#usage.getNamedOptionFromKey( key );
        // A mismatch here should be fatal. Essentially if we have `recurs`, it means we are 
        // expecting an `Array<>` type here and so we must have list or some sort of iterator.
        console.assert( recurs === list, "list argument should be a recurring one." );
         
        // Space, the final frontier.... these are the continuing voyages of the file topic mess. 
        // The only case for us not handling "-" directly is we can't see when it's been 'escaped'. 
        // But we ONLY use the file topic if the argument is specifically configured 
        // to accept files, otherwise we revert to '-'.
        //
        // General rules for quoting it. 
        //    1. As a positional, if you need a file called '-' you can do
        //    `cmd ./-`. But you can quote`cmd -- -` if for some reason that 
        //    makes no sense. Quotes should always be ignored by the parser.
        //    (So `cmd "-"` is the same as `cmd -`.);
        // 
        //    2. As an named option, you can go `--option=./-`, but quoting
        //    is always available via `--option="-"`. Here quoting does make
        //    sense because (a) you can't use `--`, and (b) we can always see
        //    it. (Although you would have to escape from a shell which
        //    will strip the quotes.)  
        //
        //    3. That just leaves `--option -` which is plain asking for it.   
        if ( optionValue === FILE_TOPIC ) {
            if ( type.acceptsFileTopic ) {
                optionValue = this._useFileTopic( key, type.realiseFileAs );
                instantiated = true;
            } else {
                // FIXME: this is magic. This should be defined somewhere. 
                optionValue = REVERT_FILE_TOPIC_TO_TEXT;
                instantiated = false;
            } 
        } else if ( recurs ) {
            const i = optionValue.indexOf( FILE_TOPIC );
            if ( i !== -1 ) {
                if ( !type.acceptsFileTopic  ) { 
                    // FIXME: we are tracking the file topic key, and have lost it if it's in a list.
                    // This has various exciting ways to break;
                    optionValue[i] = REVERT_FILE_TOPIC_TO_TEXT;
                } else {
                    optionValue[i] = this._useFileTopic( key, type.realiseFileAs );
                }
            }
        }
        console.assert( this.#usage.hasKey( key ), json_q`Invariant: key ${key} should exist` );
        
        console.assert( !this.present.has( key ), json_q`Invariant: key ${key} passed multple times` );
        console.assert( !!list === !!recurs, json_q`Invariant: key ${key}: isList (${!!list}) should match recurs (${!!recurs})` ); 
        if ( list ) {
            if ( instantiated === INSTANTIATE_VIA_LOOKUP )
                throw new Error( "Expressions are not currently available in lists" ); 
            if ( optionValue.length ) {
                if ( typename === 'boolean' ) {
                    if ( !instantiated  )
                        throw new Error( "Internal error (boolean options should always be instantiated )" ); 
                    this.#defineProperty( key, { value: optionValue.length } );
                } else {
                    if ( instantiated ) {
                        // This is a fixme. It means `echo ${value}` won't work. InstantiateLookups can
                        // handle it. We just need to pass the original code. 
                        if ( !optionValue.some( n => n === INSTANTIATE_VIA_LOOKUP ) )
                            throw new Error( "Expressions are not currently available in lists" );
                        if ( !optionValue.every( n => typeof n !== 'string' ) )
                            throw new Error( "Instantiated values cannot be strings" );
                    }
                    this.#defineProperty( key, { value: optionValue } );
                }
            } else {
                // Setting the empty case will override the default.
            }
            // FIXME: We should be able to instantiate now: it will only be passed once. 
            // That just leaves defaulting.  
        } else {
            if ( instantiated === INSTANTIATE_VIA_LOOKUP ) {
                const expr = Expr_parse( optionValue );  
                this.#lookups.push( {key,type,optionName,optionValue,expr,index:undefined} ); 
                /// 2024_10_4: Imagine a positional is provided as `${prompt()}`: finalisation leads to 
                // three calls to create aliases, and a call from the IDL as it creates a map.
                // 
                // Even if we solve the above, imagine if the binding used it twice. We certainly
                // have to cache it, if we want to generate it on demand. For the moment,
                // we use instancing: this is a sanity check.
                this.#defineProperty( key, {get: () => {
                    throw new Error( "Not implemented!" )
                } } );
            } else {
                if ( typename === 'boolean' && !instantiated  ) {
                    throw new Error( "Internal error (boolean options should always be instantiated )" );
                }
                const value = !instantiated ? constructType( type, optionValue, optionName, this.rawDictionary )
                            : optionValue;
                this.#defineProperty( key, {value} );
            }
        }
    }
    
    // 2024_9_20: I couldn't default isInstantiated to `typeof value !== 'string'`.
    // `optionName` should be `displayName` - it should be diagnostic.
    appendParsedOption({key, value, isInstantiated, optionName = key, list = false} ) {
        this.appendKeyValue2( key, value, isInstantiated, list, optionName );
    }
    
    appendParsedOptions( parsedOptions ) {
        for ( const parsedOption of parsedOptions ) {
            this.appendParsedOption( parsedOption );
        }
    } 
    
    
    instantiateListOption( key, preventDefault = false )
        {
            // OptionName is used for user friendly diagnostics.
            const {optionName,typename,type,recurs,defaultValue} = this.#usage.getNamedOptionFromKey( key );
            if ( !recurs )
                throw new TypeError( "Not a list type" );
            
            if ( typename === 'boolean' && defaultValue === false )
                throw new Error( "Internal error (recurring booleans cannot be false)" );
            
            if ( !this.present.has( key ) ) {
                // `appendKey()` removes any empty list. So we will need to default them.
                if ( typename !== 'boolean' && false ) {
                    throw new TypeError( json_q`Key ${key} (${typename}) should have been defaulted` );
                }
                const hasDefault = Object.hasOwn( this.rawDictionary, key ); 
                if ( !hasDefault && !preventDefault ) {
                    // FIXME: this should use the defaultaValue, if it exists, shouldn't it?
                    this.rawDictionary[key] = typename === 'boolean' ? 0 : constructList( type, [], optionName, key, this.rawDictionary );
                } 
            } else {
                if ( typename !== 'boolean' ) {
                    this.rawDictionary[key] = constructList( type, this.rawDictionary[key], optionName, key, this.rawDictionary );
                }
            }
            
        }
    
    _createLexicalEnvironment()
        {
            const {rawDictionary}=this;
            if ( typeof rawDictionary.$LEXICAL_ENVIRONMENT$ !== 'undefined' )
                throw new TypeError( "About to overwrite $LEXICAL_ENVIRONMENT$" );
            rawDictionary.$LEXICAL_ENVIRONMENT$ = new LexicalEnvironmentReadOnly( rawDictionary );
        }
    
    _instantiateAndDefaultLists()
        {
            /*
                2024_8_12: Historical difference here in supplying a default.
                ==========================================================

                Positionals don't default; named options do.

                Not defaulting means `$1 = defaultValue` and `$1 ?? createDefault()`
                work as expected; this is important for dir. The alternative
                is trying to select on `$1.length`, which doesn't work as `?:` demands
                a boolean, and fixing that is clumsy and non-obvious.

                The goal is that defaulting DOES NOT happen when a default is unnecessary
                (because of defaulting or '??') but will happen when a default is implied.
                And we have good enough visibility into the binding to be able to spot that. 

            */
            /*
                2024_8_13:
                 
                We also have a dependency problem. FileLists, rely on exclude. Currently
                exclude is text, but, really, a glob-list should be a glob and it needs to be
                instanced before file-lists ANYWHERE are. 

                There's also an issue with CWD. But the host handles that. So we need to know
                which (if any) other options an option depends on before initialisation,
                and the construct the dependency graph.
                  
            */
            for ( const {key,recurs} of this.#usage.enumAllOptions() ) {
                if ( recurs )  
                    this.instantiateListOption( key, false );
            }
            for ( const {key,recurs} of this.#usage.enumAllPositionals() ) {
                // 2024_8_12: 
                // Historical (and conveient?) behaviour: don't default a list it it doesn't exist.
                // This means you can dectect if an argument e.g. `$1 ?? default`. 
                // We need a lot of tidying up of the defaulting code to pick this up and 
                // correctly handle defaults.
                if ( recurs )
                    this.instantiateListOption( key, true );
            }
        }
    
    // 2024_10_2: very hastily grafted in to fit a need.
    _instantiateExpressions() {
        const {rawDictionary} = this;
        for ( const {key,type,optionName,optionValue,expr,index} of this.#lookups ) {
            const result = expr.exec( new LexicalEnvironmentReadOnly( rawDictionary ), {} );
            // Soft coercion: if it's a string, convert it. Else leave as is.
            // This means you can write `${env.PORT}` and have it converted to a number
            // for a number paramter - exactly as would happen on the command line.
            //
            // Q: Should we box such external strings and flag them as "raw", and only do
            // it for them? I.e. taint checking. That could affect the whole process.
            //
            // A: The general argument is isntancing strings is idempotent, and I've yet
            // to find a case where this isn't true. But I'm in favour of taint checking
            // as a principle - although it means things like `prompt()` either won't be
            // compatible with the web standard or we can't taint check them.
            const instantiatedValue = typeof result === 'string' 
                                    ? constructType( type, result, optionName, rawDictionary )
                                    // FIXME: we need to type check - or rather, have the expression type check.
                                    : result;
             
            if ( typeof index === 'undefined' ) {
                Object.defineProperty( rawDictionary, key, { value: instantiatedValue } );
            } else {
                if ( !Number.isSafeInteger( index ) )    
                    throw new TypeError( "Invalid index" );
                const list = rawDictionary[key];
                if ( !Array.isArray( list ) ) 
                    throw new Error( "Attempt to instantiate element of a non list" );
                if ( index < 0 || index >= list.length )
                    throw new RangeError( "Index out of range" );
                list[index] = result;
            }
        }
    }
    
    finalise()
        {
            if ( this.#finalised )
                throw new Error( "Can only finalise() once!" );

            // Instantiae positionals.
            const {rawDictionary}=this;
            
            this._createLexicalEnvironment();
            this._instantiateAndDefaultLists();
            this._instantiateExpressions();
            const $ = [];
            // If the host hasn't set positionals, then `#$` will be undefined.
            // (And the webhost doesn't do this.)
            for ( const key of this.#$ ?? [] ) {
                $.push( rawDictionary[key] );
            }
            rawDictionary.$ = $;
            for ( const [alias,name] of this.#usage.getAliases() ) {
                if ( Object.hasOwn( rawDictionary, name ) ) {
                    rawDictionary[alias] = rawDictionary[name];
                }
            }  
            // 2024_6_3: if we constructed the rawDictionary by inheriting from the defaults
            // then hasOwn() would tell you this.
            Object.defineProperty( 
                this.rawDictionary,
                explicitlySetVariables, // Fimxe: should at least be a symbol.
                {
                    enumerable: false,
                    value: new Set( this.present ) 
                } );
            this.#finalised = true;
            // ;this.rawDictionary[explicitlySetVariables] = new Set( this.present );
            return this.rawDictionary;
        }

    usesFileTopic() {
        return typeof this.#fileTopicKey !== 'undefined' 
    }
};



