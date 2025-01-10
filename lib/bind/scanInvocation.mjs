import {TYPE_LOOKUP,TYPE_CALL,TYPE_ARRAY,TYPE_OBJECT,TYPE_VALUE,TYPE_BINARY, TYPE_UNARY,TYPE_TERNARY,BINARY_ALT,UNARY_CAST,TYPE_METHOD,TYPE_CALLBACK} from "./ast.mjs";

/// @brief This is reallty just a breadth first iterator.
export default function
scanInvocation( invocation, includeReturnAssignment = true )
    {
        const lookups = [],
              topLevelFunctions = new Set;
        const processing = new Set;
        const addElement = ( node, optional = false ) => {
            if ( node.type === TYPE_LOOKUP ) {
                lookups.push( node );
            } else if ( node.type !== TYPE_VALUE ) {
                processing.add( node );
            }
        };
        if ( Array.isArray( invocation.args ) ) {
            for ( const element of invocation.args ) 
                addElement( element );
        } else {
            addElement( invocation.args );
        }
        for ( const node of processing ) { 
            if ( node.type === TYPE_ARRAY ) { 
                for ( const element of node.value )
                    addElement( element );
            } else if ( node.type === TYPE_OBJECT  ) {
                for ( const [,value] of node.value )  
                    addElement( value );
            } else if ( node.type === TYPE_CALLBACK ) {
                addElement( node.expr );
            } else if ( node.type === TYPE_CALL || node.type === TYPE_METHOD ) {
                for ( const arg of node.args )  
                    addElement( arg );
                // One of the problems we have is we can't distinguish methods from
                // namespaces. 
                if ( node.type === TYPE_METHOD ) {
                    addElement( node.object );
                }
                // @issue `Math.abs()` won't be seen as a call in the Math-namespace
                // but a lookup of the `Math`-object on which we apply the `abs` method.
                //  
                // Should namespaces be syntatic. Should we hand a list of them
                // to the parser?
                //
                // Intent here is we can spot functions that are called
                // so we can spot the imports.
                node.type === TYPE_CALL 
                    && topLevelFunctions.add( node.name ); 
                
            } else if ( node.type === TYPE_UNARY ) {
                addElement( node.object );
                // This is a map cast to so the memmbers could contain lookups. 
                if ( node.op === UNARY_CAST && typeof node.cast.basetype === "object" && node.cast && node.cast.basetype ) {
                    processing.add( node.cast.basetype );
                }
                // Also we need to spot bool casting and mark the object as optional. 
            } else if ( node.type === TYPE_BINARY ) {
                addElement( node.lhs, node.op === BINARY_ALT );
                addElement( node.rhs );
            } else if ( node.type === TYPE_TERNARY ) {
                addElement( node.condition );
                // These are not caught. But may not invoked. So I guess they are optional.
                addElement( node.true, true );
                addElement( node.false, true );
            } else {
                throw new TypeError( `Unknown node type ${JSON.stringify(node.type)}` );
            }  
        }
        if ( includeReturnAssignment && typeof invocation.output !== 'undefined' ) {
            lookups.push( { type: TYPE_LOOKUP, name: invocation.output.name } );
        }    
        return lookups;
    }

export function 
_getBoundNames( invocation, includeReturnAssignment = true ) 
    {
        // FIXME: this doesnt' include the output, does it. 
        return Array.from( scanInvocation( invocation, includeReturnAssignment ), ({name}) =>name );
    }

export function 
getBoundNames( invocation, includeReturnAssignment = true ) 
    {
        return Array.from( invocation.globals );
    }
