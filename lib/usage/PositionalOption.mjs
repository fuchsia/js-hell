import {NODETYPE_POSITIONAL,NODETYPE_LIST,NODETYPE_LITERAL,NODETYPE_ENUM,NODETYPE_POSITIONAL_WITH_SUFFIX,NODETYPE_POSITIONAL_VARIANT} from "./parse.mjs";
import {getOrCreateTypeRegistration,createLiteral,createDiscriminatedUnion} from "../TypeLib.mjs";
// import Array_mapWithStructure from "../utils/Array_mapWithStructure.mjs";

const TYPENAME_LITERAL = Symbol( "literal" );

// 2024_8_10: Q: Why is this not shared with NamedOption?
//            A: This can have much deeper recursion, and also literals.       
function
createTypeRecord( {type,value,suffix}, name ) {
    if ( type === NODETYPE_LIST ) {
        if ( value.type === NODETYPE_LIST )
            throw new TypeError( "list-in-list" );
        return createTypeRecord( value, name );
    } else if ( type === NODETYPE_POSITIONAL || type === NODETYPE_POSITIONAL_WITH_SUFFIX || type === NODETYPE_ENUM ) {
        // 2024_8_10: Is this value reliable? Do we strip the suffix? How do we handle enum?
        return { typename: value, type: getOrCreateTypeRegistration( value, name ) };
    } else if ( type === NODETYPE_POSITIONAL_VARIANT ) {
        // 2024_8_10: Is the typename valid? Better to leave it null? 
        return { typename: value, type: createDiscriminatedUnion( value ) };
    } else if (  type === NODETYPE_LITERAL ) {
        return { typename: TYPENAME_LITERAL, type: createLiteral( value, name ) };
    } else {
        throw new TypeError( `Unknown nodetype ${JSON.stringify( type )}` );
    }
}

function
createVariableName( {type,value,suffix} )
    {
        if ( type === NODETYPE_LIST ) {
            return value.value;
        } else if ( type === NODETYPE_POSITIONAL ) {
            return value;
        } else if ( type === NODETYPE_POSITIONAL_WITH_SUFFIX ) {
            return value + suffix;
        } else { 
            return ''
        }
    }

// Type definition of positional
export default class 
PositionalOption {
    key;               //< string: should be `$1`, `$2`, etc...
    aliases = new Set; //< Set<string>: other keys that refer to this. i.e `orgTypeIdentifier` if not `duplicateIdentifier`.
    // optionName
    // shortAlias
    // optionNames
    typename;     //< string: Namedoption allows array for enumerated values. Unions will probably be the literal text.
                  // Maybe we should register a symbol for each literal? And then arrays are always unions?
    type;
    mandatory = true; //< boolean: THIS IS BROKEN; it's always true. But it's here for compatibility with NamedOption.
    // platform           
    recurs;       //< boolean: a list.
    orgTypeName;  //< A complete misnomer. `${orgTypeName}` will be the binding in the lexical environment, and we should call it that.
    orgTypeIdentifier; //< string: This really is the `FILE1` or `ICO_FILE` or whatever, exactly as supplied by the user.
    index;             //< This is the n in `$n`.
    // defaultText
    // defaultValue
    // annotation 
    constructor({typename = '', type = null,recurs =false,orgTypeName ='',orgTypeIdentifier='',index}){
        this.key = `\$${index}`;
        Object.assign( this, {typename,type,recurs,orgTypeName,orgTypeIdentifier,index} )
    }
     
    static fromAstNode( node, index, name = `\$${index}`)
        {
            const {typename,type} = createTypeRecord( node, name ),
                  orgTypeName = createVariableName( node ),
                  recurs = node.type === NODETYPE_LIST; 
            return new PositionalOption({ typename, type, recurs, orgTypeName, 
                orgTypeIdentifier: recurs ? node.value.identifier : node.identifier, index } );
        }

};


