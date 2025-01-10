import {NODETYPE_NAMED,NODETYPE_POSITIONAL,NODETYPE_LITERAL,NODETYPE_LIST,TYPE_TRUE,TYPE_FALSE} from "./ast.mjs";
import {getOrCreateTypeRegistration} from "../TypeLib.mjs";
import {toKebabCase as CamelCase_toKebabCase, toSnakeCase as KebabCase_toSnakeCase} from "../utils/CamelCase.mjs";
import {DEFAULT_MISSING_BOOL} from "../consts.mjs";
import {ARGVALUE_NONE} from "./CliOption.mjs";

export const PLATFORM_INLINE = "inline",    
             PLATFORM_HOST = "host"; // Added via a host via addOption.

function 
isValidTypename( typename ) {
    if ( typeof typename === 'string' || typeof typename === 'symbol' )
        return true;
    if ( !Array.isArray( typename ) )
        return false;
    return typename.every( element => typeof element === 'string' );
}

export const 
DEFAULTTYPE_RAW = 'raw',
DEFAULTTYPE_INSTANTIATED = 'instantiated',
DEFAULTTYPE_NONE = 'none'; 

export function
classifyDefault( {defaultText,defaultValue} ) {
    if ( typeof defaultValue !== 'undefined' ) {
        return { type: DEFAULTTYPE_INSTANTIATED, value: defaultValue }; 
    } else if ( typeof defaultText !== 'undefined' && defaultText ) {
        return { type: DEFAULTTYPE_RAW, value: defaultText };
    } else {
        return { type: DEFAULTTYPE_NONE, value: undefined };
    }
}


/// @brief This is a description of an "option" (or "argument") it should be named.
///
/// For the moment it's used only for named options. Although there's no reason it can't be
/// used for positionals.
///
/// Q: Why does this exist, when everybody else seems to use use Ast Nodes?
///
/// Q: Can this not have the option names?  
export default class 
NamedOption {
    key;            //< string: the name as javascript sees it. FIXME: there's no reason
                    // an option couldn't have aliases. In which case this should be the
                    // canonical name; one example is `input`/`$-`, but that's handled
                    // in the binding. And maybe that's the way to deal with them all.
    
    optionName;     //< This should(?) have the leading '--'; TO BE DELETED.
    shortAlias;     //< This lacks the leading '-'; it's just the letter or ('' or undefined). TO BE DELETED.
    optionNames;    //< We initialise this to the names with leading '-'. 
    
    typename;       //< String|Array. An array will be an array of the enumerated values possible. 
                    // I don't know how union-types are handled.
                    // FIXME: There is some historical madness around booleans. 
    type;           // Ugh. Should be typename and left to others to sort out?
     
    mandatory;      //< boolean: true if mandatory; false if optional.  
    
    platform;       //< string: "" for options the user defined. Something else (possible `"platform"`)
                    // if this was interpolated in. (Could possitionals by indicated here?)
                    // PLATFORM_INLINE isused for inline options.
                    // A better name here might be "group"? Especially if help wants to sort options
                    // by group.
    
    recurs;         //< boolean: a sop to the command line. This will be a list. I don't know
                    // if the type reflects that.

    defaultText;    //< string|undefined|DEFAULT_MISSING_BOOL: a textual representation of 
                    // the object (i.e an uninstantiated value) which shoudl be used 
                    // if the option is ommitted.
                    // 
                    // It must be `undefined` if the option is mandatory.  
                    // It need not be defined for non-mandatory options.

    defaultValue;   // any: a literal value, that is used to default the option. The instantiated value.
                    // It's a hint. It will take precedence if `defaultText` is also
                    // defined.
                    // 
                    // Generally this has been extracted from the binding. But that may not
                    // be the case for booleans.  
     
    annotation = ""; //< string: any comment the user added. Currently not implemented.
    
    constructor({key,optionName,shortAlias,typename,mandatory,platform,recurs,defaultText,defaultValue,annotation=""})
        {
            if ( !isValidTypename( typename ) ) 
                throw new TypeError( "Invalid typename" );
            if ( typeof optionName !== 'string' || !optionName.startsWith("--") )
                throw new TypeError( "Invalid option name" );
            let type;
            if ( typename === "" ) {
                if ( platform !== PLATFORM_INLINE )
                    throw new TypeError( "Invalid typename" ); 
                type = null;
            } else {
                type = getOrCreateTypeRegistration( typename, key );
            }
            const optionNames = [ optionName ];
            if ( typeof shortAlias === 'string' && shortAlias ) {
                if ( shortAlias.length !== 1 )
                    throw new Error( "Invalid short alias" );
                optionNames.push( `-${shortAlias}` );
            }
            Object.assign( this, {key,optionName,shortAlias,optionNames,typename,type,mandatory,platform,recurs,defaultText,defaultValue,annotation} );
        }

    static fromMandatoryAstNode( node )
        {
            const recurs = node.type === NODETYPE_LIST; 
            const {platform=""}=node;
            const {type,key,value,option:optionName,shortAlias} = recurs ? node.value : node;
            console.assert( type === NODETYPE_NAMED, "node must be a named parameter" );
            return new NamedOption({ 
                       key, 
                       optionName,
                       shortAlias,
                       typename: value,  
                       mandatory: true,
                       platform,
                       recurs: recurs?true:false,
                       defaultText: undefined,
                       defaultValue: undefined,
                       annotation: node.annotation 
                   } );
        }

    static fromNonMandatoryAstNode( node, defaultText, defaultValue )
        {
            const recurs = node.type === NODETYPE_LIST; 
            const {platform=""}=node;
            const {type,key,value,option:optionName,shortAlias} = recurs ? node.value : node;
            console.assert( type === NODETYPE_NAMED, "node must be a named parameter" );
            return new NamedOption({ 
                       key,
                       optionName,
                       shortAlias, 
                       typename: value, 
                       mandatory: false,
                       platform,
                       recurs: recurs?true:false,
                       defaultText,
                       defaultValue,
                       
                       annotation: node.annotation
                        
                   } );
        }

    static fromInlineOption({name:key,typename,hasDefaultValue,defaultValue}) {
        if ( typename === 'string' ) {
            typename = 'String';
        } else if ( typename === 'boolean'  ) {
            if ( hasDefaultValue ) {
                if ( typeof defaultValue !== 'boolean' ) {
                    throw new Error( "Assert: typeof defaultValue === 'boolean'" );
                }
                // Yes this is correct: it's reversed; if you do `@option x = true` then
                // x will be true unless you override it from the command-line.
                typename = defaultValue ? TYPE_FALSE : TYPE_TRUE;  
            } 
        }
        const optionName = ( typename === TYPE_FALSE ? '--no-' : '--' ) + CamelCase_toKebabCase( key );
        return new NamedOption({
            key,
            optionName,
            shortAlias: undefined,
            typename,
            platform: PLATFORM_INLINE,
            recurs: false,
            defaultText: undefined,
            defaultValue: defaultValue,
        } );
    }
    
    isInsaneBoolean() {
        const {typename} = this;
        return typename === TYPE_TRUE || typename === TYPE_FALSE;
    }
    
    /// @brief This function is a transititory hack around the old way of doing things.
    /// The aim is parse/build generate something saner from the start: a CliOption map
    /// and a type map.  
    static sanitiseBoolean( options ) {
        if ( options.length !== 1 && options.length !== 2 )
            throw new TypeError( "1-2 booleans required for sanitisation" );

        if ( !options[0].isInsaneBoolean() ) {
            throw new TypeError( "No sanitisation necessary" );
        }
        if ( options.length > 1 && !options[1].isInsaneBoolean() ) {
            throw new TypeError( "No sanitisation necessary" );
        }
        // FIXME: think about tristates.
        const o = new NamedOption( options[0] );
        o.typename = 'boolean';
        const defaultType = typeof o.defaultValue;
        if ( defaultType !== 'boolean' && defaultType !== 'undefined' ) {
            throw new TypeError( "`typeof defaultValue` should be `undefined` or `boolean`" );
        }
        // FIXME: opportunity to check mandatory, etc.. agree.
        if ( options.length === 2 ){
            console.assert( !o.mandatory, "not mandatory" );
            o.defaultText = undefined;
            o.defaultValue = undefined;
        } else {
            // 2024_7_26: I though these should always be boolean, and DEFAULT_MISSING_BOOL,
            // but they're not. It's too late Friday to think about it. 
            console.assert( typeof o.defaultValue === 'boolean' || typeof o.defaultValue === 'undefined', "single boolean arg must have a default value" );  
            console.assert( o.defaultText === DEFAULT_MISSING_BOOL || typeof o.defaultText === 'undefined', "expected default text to be DEFAULT_MISSING_BOOL", o.defaultText );  
        }
        // FIXME: how do we handle to differing annotations? 
        return o; 
    }

    /// @brief Inline options are those defined via the `@option` decorator.
    isInline() {
        return this.platform === PLATFORM_INLINE;
    }
    
    /// @brief Return a concatenation of the option names for this option, in usage format.
    toBaseOptionName() {
        const {optionNames} = this;
        if ( optionNames.length > 1 ) {
            return `(${optionNames.join( '|' )})`;
        } else {
            return optionNames[0];
        }
    }
        
    /// @brief This excludes the '[]' around a non-mandatory op.
    /// Used by help.
    ///                                 
    /// FIXME: tie in with the existing stringify.
    toBareUsage( cliMap ) {
        let text = this.toBaseOptionName();
        let hasArgument;
        // Q: Should we contain the cli map parameters? 
        // A: We can't directly include the implied value, because it varies by option.
        // And we couldn't handle the `[--excude=STR...|--no-exclude]` case if we included
        // the ARGVALUE_xxx constant directly.  
        //
        // Q: Does that also lead us to including the option name in the CliOption record?
        // And storing all the cliOption parameters in here?
        if ( this.optionNames.length > 1 ) {
            // FIXME: we must check they are all identical and rule out ARGVALUE_OPTIONAL.
            // none of that yet happens.
            hasArgument = cliMap.get( this.optionNames[0] ).arg !== ARGVALUE_NONE;
        } else {
            // FIXME: rule out ARGVALUE_OPTIONAL.
            hasArgument = cliMap.get( text ).arg !== ARGVALUE_NONE;
        }
        
        if ( hasArgument ) {
            const {typename}=this;
            if ( Array.isArray( typename ) ) {
                text += `=(${typename.join( '|' )})`;
            } else {
                // FIXME: this could be ( x|y ) ( is that an array?)
                text += '=' + KebabCase_toSnakeCase( typename  );
            }
        }
        if ( this.recurs  ) {
            text += '...';
        }
        return text;
    }
};


