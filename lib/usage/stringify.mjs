import {toSnakeCase as CamelCase_toSnakeCase} from "../utils/CamelCase.mjs";
import json_q from "../utils/json_q.mjs";
import Array_accumulate from "../utils/Array_accumulate.mjs";
import {NODETYPE_ENUM, NODETYPE_LIST, NODETYPE_LITERAL, NODETYPE_NAMED, NODETYPE_POSITIONAL, NODETYPE_POSITIONAL_VARIANT, NODETYPE_POSITIONAL_WITH_SUFFIX} from "./parse.mjs";
import {NODETYPE_REST} from "./ast.mjs";


export default function
stringify( node ) {
    // 2024_3_18: I've forgotten how this works, but, apprently, this is true for optional
    if ( Array.isArray( node ) ) {
        return `[${Array_accumulate( node, stringify, ' ' )}]`;
    } else if ( node.type === NODETYPE_LITERAL ) {
        return node.value;
    } else if ( node.type === NODETYPE_LIST ) {
        return stringify( node.value ) + '...';
    } else if ( node.type === NODETYPE_POSITIONAL ) {
        return CamelCase_toSnakeCase( node.value );
    } else if ( node.type === NODETYPE_POSITIONAL_VARIANT ) {
        return `(${Array_accumulate( node.value, CamelCase_toSnakeCase, '|' )})`;
    } else if ( node.type === NODETYPE_NAMED ) {
        return Array_accumulate( stringifyOptionToParts( node, { annotation: false } ), p => p.value, '' );
    } else if ( node.type === NODETYPE_ENUM ) {
        return `(${node.value.join( '|' )})`;
    } else if ( node.type === NODETYPE_REST ) {
        return `...`;
    } else {
        console.log( node );
        console.log( NODETYPE_POSITIONAL, node.type === NODETYPE_POSITIONAL );
        throw new TypeError( json_q`Unsupported node type (${node.type})` );
    }
}
function 
getOptionNode( node ) {
    if ( node.type === NODETYPE_LIST ) {
        return node.value;
    } else if ( node.type === NODETYPE_NAMED ) {
        return node;
    } else {
        console.log( node );
        return null;
        throw new TypeError( "Not an option node" );
    }
}
/// @brief Return the `--option` name.
export function
getOption( node ) {
    return getOptionNode( node )?.option;
}

/// @param `defaultText`: originally intended to be the "environment variable" (i.e. uninstantiated
///                       and thus the textual form) it can now also be a default extracted from the
///                       binding; e.g. a number, a boolean, or a value. 
export function
stringifyOptionToParts( _node, { annotation: includeAnnotation = true, defaultJson = undefined } = {} ) {
    const node = getOptionNode( _node );
    if ( !node ) {
        console.log( _node );
        throw new TypeError( "Not an option node" );
    } 
    const result = [];
    const {option,shortAlias,value} = node;
    const {annotation} = _node;
    // Should this publish the above, and the caller then edit it out?
    if ( shortAlias ) {
        result.push( 
            { type: 'literal', value: '(' },
            { type: 'short', value: `-${shortAlias}` },
            { type: 'literal', value: '|' },
            { type: 'long', value: option },
            { type: 'literal', value: ')' }
         );
    } else {
         result.push( 
             { type: 'long', value: option },
          );
    }
    if ( value !== 'true' && value !== 'false' ) {
        result.push( { type: 'literal', value: '=' } );
        if ( Array.isArray( value ) ) {
            // FIXME: how do we tell literals from type names? Literals are lower case.
            result.push( { type: 'type', value: '(' + Array_accumulate( value, x => x, '|' ) + ')' } );
        } else {
            result.push( { type: 'type', value: CamelCase_toSnakeCase(value ) } );
        }
    } 
    if ( _node.type === NODETYPE_LIST ) {
        // 1. We are missing brackets round it. But we don't know how to do that.
        // 2. Should we output this differently; e.g. HG does a ' [+]'.
        result.push( { type: 'literal', value: '...'}  );
    }
    if ( includeAnnotation && annotation ) {
        result.push(
            { type: 'literal', value: ': ' },
            { type: 'annotation', value: annotation } 
        );
    }
    // FIXME: if the node is a boolean node, we don't want any default.
    if ( typeof defaultJson !== 'undefined' ) {
        result.push( 
            { type: 'literal', value: ' ' },
            { type: 'literal', value: '[' },
            { type: 'literal', value: 'DEFAULT:' },
            { type: 'literal', value: ' ' },
            { type: 'value',  value: JSON.stringify( defaultJson ) },
            { type: 'literal', value: ']' }
         );
    }
    return result; 
}