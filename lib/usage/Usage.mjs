import {buildFromStringWithoutPositionals} from "./build.mjs"; // FIXME: circular links.
import parseOptions,{SOURCE_CLI,FILE_TOPIC,KEY_POSITIONAL} from "../args/parseOptions.mjs";
import stringifyNode from "./stringify.mjs";
export const SOURCE_DEFAULT = 'default', SOURCE_COMPUTED = 'computed';
import json_q from "../utils/json_q.mjs";
import {classifyDefault,
DEFAULTTYPE_RAW,
DEFAULTTYPE_INSTANTIATED,
DEFAULTTYPE_NONE} from "./NamedOption.mjs";
import {NODETYPE_REST} from "./ast.mjs";
 
function 
*getRecurringNamedOptions( optionFromKey ) {
    for ( const namedOption of optionFromKey.values() ) {
        if ( !namedOption.recurs )
            continue;
        if ( namedOption.mandatory ) {
            throw new Error( "Invariant: a recurring key cannot be mandatory" );
        }
        if ( classifyDefault( namedOption ).type !== DEFAULTTYPE_NONE ) {
            throw new Error( "Invariant: recurring items cannot have a default" );
        }
        yield namedOption; 
    }
}

function
splitInstantiation( args ) {
    const {instantiated = [],raw = []} = Object.groupBy( args, ({isInstantiated}) => isInstantiated ? 'instantiated' : 'raw' );
    if ( instantiated.length === 0 ) {
        return { values: raw.map( ({value}) => value ), isInstantiated: false };
    } else if ( raw.length === 0 ) {
        return { values: instantiated.map( ({value}) => value ), isInstantiated: true };
    } else {
        // I think there should be a rule: instantiation results in a non string (?and non-symbol)
        // or _re_-instantiating it is idempotent.
        //
        // The re means an uninstantiated FILENAME might be made absolute, but reinstantiating
        // that won't change it.
        //
        // The aim being instantiating need only check for a string (or symbol?) value and
        // can safely instantiate those.
        throw new Error( "Cannot mix instanatiated and unintatiated values" );
    }
}


export default class
Usage {
    // The AST: 
    #positionalAstNodes;   //< Used for help, apparently. And nowhere else?

    // The horribleness after the above has been hacked to bits.
    #positionalTree;       //<: PositionalTree
    #saneOptionsFromKey;   //<: Map<string:key,NamedOption>
    #cliMap;               //<: Map<string:optionName,CliOption>
    
    get positionalOptions() { return this.#positionalTree; } // Historical name. But we are inlining the methods - see below.
    get cliMap() { return this.#cliMap; }
    get saneOptionsFromKey() { return this.#saneOptionsFromKey; }
    get positionalAstNodes() { return this.#positionalAstNodes; }

    constructor({positionalAstNodes,positionalTree,saneOptionsFromKey,cliMap}) {
        this.#positionalAstNodes = positionalAstNodes; 
        this.#positionalTree = positionalTree; 
        this.#saneOptionsFromKey = saneOptionsFromKey; 
        this.#cliMap = cliMap;
    }

    static fromOptionsOnly( optionsString, platform = "", defaultStrings = {}, defaultValuesEntries = [] ) {
        return buildFromStringWithoutPositionals( optionsString, platform, defaultStrings, defaultValuesEntries );
    }

    hasPositionalOptions() {
        return !this.#positionalTree.isEmpty();
    }
    /// @brief Was any of the positionals optins declared with "..." e.g. `"API=1 cmd TEXT FILE..."`
    hasRecurringPositional() {
        return this.#positionalTree.getList() !== null;
    }
    /// @brief Return the types used in the positional options. This is for the almost certainly obsolote
    /// IDL/`anyPositionalAcceptStdin()`
    getRecurringPositionalType() {
        return this.#positionalTree.getList()?.type ?? null;
    }

    /// @brief Return all the types. Used how?
    enumPositionalTypes() {
        return new Set( this.#positionalTree.getLongestBranch().map( ({type}) => type ) ).values(); 
    }

    /// @brief Return a string describing the positionals. Used by help.
    getPostionalString() {
        const iterator = this.#positionalAstNodes.values();
        iterator.next(); // Drop $0.
        let result = '';
        for ( const node of iterator ) {
            if ( result )
                result += ' ';
            result += stringifyNode( node );
        }
        return result;
    }
    
    /// @brief Return a NamedOptions for every named option.
    ///
    /// Q: Should we merge this with enumAllPositionals()? If not we should
    /// rename it `enumAllNamedOptions()`. 
    enumAllOptions() {
        return this.#saneOptionsFromKey.values();
    }
    enumAllPositionals() {
        return this.#positionalTree.enumOptions();
    }
    
    getCliMap() {
        return this.#cliMap;
    }

    /// @brief The list of keys used - currently for named options. (No $1, $2, etc.. )
    keys() {
        return this.#saneOptionsFromKey.keys();
    }
    /// @brief Get a named option from the lexical variable ("the key") that it is bound to. 
    // 2024_7_31: Eventually, positionals should be handled symmetrically with Named - $1, etc..
    getNamedOptionFromKey( key ) {
        // 2024_8_12: to do: merge into one list.
        if ( key.startsWith( '$' ) ) {
            return this.#positionalTree.get( key );
        }
        return this.#saneOptionsFromKey.get( key );
    }
    /// @brief Is there a named option bound to a given lexical variable ("the key").
    /// Should generalise to $1, etc.. at some point.
    hasKey( key ) {
        // 2024_8_12: to do: merge into one list.
        if ( key.startsWith( '$' ) ) {
            return this.#positionalTree.has( key );
        }
        return this.#saneOptionsFromKey.has( key );
    }
    

    /// @brief Create a NEW Usage object, which inherits all the properites of this
    /// and adds the extra options listed here.
    addOptions( usage ) {
        const saneOptionsFromKey = new Map( this.#saneOptionsFromKey.entries() );  
        const cliMap = new Map( this.#cliMap.entries() );  
        // Q: Should we use usage.#cliMap/usage.#saneOptionsFromKey - guaranteeing we
        // are a usage?
        for ( const [optionName,record] of usage.cliMap ) {
            if ( cliMap.has( optionName ) ) 
                throw new TypeError( json_q`key ${optionName} already defined` );
            cliMap.set( optionName, record );
        }
        for ( const [key,record] of usage.saneOptionsFromKey ) {
            if ( saneOptionsFromKey.has( key ) ) 
                throw new TypeError( json_q`key ${key} already defined` );
            saneOptionsFromKey.set( key, record );
        }
        return new Usage({
            positionalAstNodes: this.#positionalAstNodes,
            positionalTree: this.#positionalTree,
            saneOptionsFromKey,
            cliMap
        } );  
    }
    
    /// @brief Return the names of options in usage which are also used here.
    getConflictingOptions( usage ) {
        return new Set( this.#cliMap.keys() ).intersection( new Set( usage.cliMap.keys() ) );
    }

    /// @brief This is used by main to do processing before the scriptlet name.
    /// It will eventually be fused. (It's tail should be `SCRIPLTET ...ARGS`
    /// and we return the remaining args (as an iterator?))
    rawParse( argvIterator ) {
        const cliMap = this.#cliMap;
        return parseOptions( cliMap, argvIterator );
    }
    
    // - parseOptions may not be the best name. Should this be called `resolveOptions()`?
    *parseOptions( argv ) {
        const optionFromKey = this.#saneOptionsFromKey,
              cliMap = this.#cliMap,
              unseenOptions = new Set( optionFromKey.values() ),
              // 2024_10_16: No assumption of iterators.
              lists = new Map( Array.from( getRecurringNamedOptions( optionFromKey ), namedOption =>[namedOption,[]] ) );
        const rawPositionals = [];
        for ( const desc of parseOptions( cliMap, argv, this.#positionalTree.getTailStartIndex() ) ) {
            if ( desc.key === KEY_POSITIONAL ) {
                rawPositionals.push( desc );
                continue;
            } 
            const namedOption = optionFromKey.get( desc.key );
            if ( lists.has( namedOption ) ) {
                const curList = lists.get( namedOption );
                curList.push( desc ); 
            } else if ( unseenOptions.has( namedOption ) ) {
                yield desc; 
            } else {
                // Try to help a user who does "cmd -C dir --cwd dir" understand what they have done wrong;
                // especially true if a command has aliases.
                //
                // FIXME: we definitely need positional information about the command-line
                // so we can point out the error.
                //
                // Q: Should we, instead of throwing, yield an error condition and leave the user to raise it? 
                throw new TypeError( json_q`Cannot repeat option ${namedOption.toBaseOptionName( cliMap )}` );
            }
            unseenOptions.delete( namedOption );
        }
        for ( const [namedOption,options] of lists ) {
            const {optionName} = namedOption;
            const {values, isInstantiated } = splitInstantiation( options );
            // Q: Does this need a filter call?
            // A: Currently filter is used for spotting the FILE_TOPIC. It only want to see the arguments
            // from cliMap.parseOptions before they are accumulated, or when they are defaulted. So
            // it really should be called if defaulted.
            yield { 
                key: namedOption.key, 
                value: values, 
                isInstantiated, 
                optionName, 
                source: values.length ? SOURCE_CLI : SOURCE_DEFAULT,
                list: true, 
            }; 
            // NB `getRecurringNamedOptions()` enforces the invariants that lists are neither mandatory 
            // not defaulted. 
            unseenOptions.delete( namedOption );
        }

        // 2024_7_26: Experimental. The argument for doing this is 
        // it removes a lot of the complexity in initialisation.
        //
        // It also allows us to default `input` to the file topic if, 
        // $-/input is bound.
        for ( const namedOption of unseenOptions ) {
            // Help, being a boolean, has a default. So skip it.
            if ( namedOption.key === "help" ) 
                continue;
            
            // Mandantory options don't have a default.
            if ( namedOption.mandatory )
                throw new TypeError( json_q`Missing option ${namedOption.toBareUsage( cliMap )}` );
            
            const {type,value} = classifyDefault( namedOption ); 
            if ( type !== DEFAULTTYPE_NONE ) {
                const {optionName} = namedOption;
                yield { key: namedOption.key, value, isInstantiated: type === DEFAULTTYPE_INSTANTIATED, optionName, source: SOURCE_DEFAULT, list: false } ;
            } else {
                // Q: Should we return a hint in here?
                // A: Well we are planning to remove defaults form us, so leave it.
            }  
        }
        // FIXME: have this return a zipped array.  
        const {positionals, positionalOptions} = this.#positionalTree.arrange( rawPositionals );
        // This fails when we have a tail, because we haven't added an AST node.
        console.assert( positionals.length === positionalOptions.length, "PositioanlOptions and rawPositionals must marry up" );
        for ( let i = 0; i < positionals.length; ++i ) {
            const option = positionalOptions[i];
            if ( !option.recurs ) {
                const {value,isInstantiated,source} = positionals[i];
                yield { key: option.key, value, isInstantiated, optionName: option.key, source: SOURCE_CLI, list: false } ;
            } else {
                const {values, isInstantiated } = splitInstantiation( positionals[i] );
                yield { key: option.key, value: values, isInstantiated, optionName: option.key, source: SOURCE_CLI, list: true } ;
            } 
        }
        // Historic quirk: probably wants to be deleted.
        yield {
            key: '$',
            value: positionalOptions.map( n => n.key ),
            isInstantiated: undefined,  // This should be a list of references; i.e. aliases.
            optionName: '$',
            source: SOURCE_COMPUTED,
            list: true
        }
        
    }
                         
    *getAliases() {
        for ( const {aliases,key} of this.#positionalTree.enumOptions() ) {
            // yield [positionalOption.key,positionalOption.index];
            for ( const alias of aliases ) {
                yield [alias, key]
            }
        }
        
    }

    // 2024_10_14: Huge hack added on to quickly handle operators without much thought.
    // It means '>' and '<' work as "options".
    // 
    // It doesn't create a new `Usage` because it expects `addOptions()` has already clone
    // it. (So should it be an argument to addOptions) 
    addOperators( map ) {
        const cliMap = this.#cliMap;
        for ( const [key,value] of Object.entries( map ) ) {
            if ( !cliMap.has( value ) ) {
                // Soft fail because `--input` may not have been added and the user
                // is too lazy to work that out. FIXME: we should be able to hard
                // fail.
                // throw new Error( `No option '${value}' for operator '${key}'` );
                continue;
            }  
            cliMap.set( key, this.#cliMap.get( value ) );
        }
        return this;
    }

    // 2024_11_25: More hacking: added because we manually set this for js-hell only.
    // 
    addTail() {
        this.#positionalTree.addTail();
        this.#positionalAstNodes.push( {type:NODETYPE_REST} ); 
    }
};