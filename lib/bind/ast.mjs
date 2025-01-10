export const
      TYPE_LOOKUP = 'lookup',
      TYPE_ARRAY = 'array',
      TYPE_OBJECT = 'object',
      TYPE_CALLBACK = 'callback',
      TYPE_CALL = 'call',
      TYPE_METHOD = 'method',
      TYPE_VALUE = 'value',
      TYPE_UNARY = 'unary',
      TYPE_BINARY = 'binary',
      TYPE_TERNARY = 'ternary',
      TYPE_CAPTURE = '->',  // This is also a ternary op.
      
      BINARY_ALT = '??',
      BINARY_SUBSCRIPT = '.',
      BINARY_PIPE = '|>',
      BINARY_COMMA = ',',
      BINARY_TYPE_ASSERTION = 'as',
      BINARY_INSTANCEOF = 'instanceof',
      BINARY_EQUALS = '===', 
      BINARY_NOTEQUALS = '!==',
      
      
      UNARY_INDEX  = 'index',
      UNARY_CAST   = 'cast',
      UNARY_SYNC   = 'sync',
      UNARY_REST  = '...',
      UNARY_LOGICAL_NOT = '!',
      UNARY_TYPEOF = 'typeof';

// These have '-s' to match var names.
export const 
    SCOPE_GLOBAL = 'globals',      //< The root of the scope heirachy: use for any undefined var inferred to exist. 
    SCOPE_IMPORT = 'imports',      //< Any declard imports. 
    SCOPE_LOCAL  = 'locals';        //< Local variables (not the topic) declared as function arguments,
    
export function
createLiteral( value )
    {
        return { type: TYPE_VALUE, async: false, value };
    }

/// @brief Useful for the argtok parser when dealing with templates.
export function
isLiteral( node ) {
    return node.type === TYPE_VALUE;
}

export function
createCallback( freeVariableNames, expr, async = false )
    {
        return {
            type: TYPE_CALLBACK,
            async,
            expr,
            freeVariableNames,
        };
    }


export function 
createLookup( identifier, {scope = undefined,defaultValue = undefined , option = false, typename = '', write = false} = {} )
    {
        return { 
            type: TYPE_LOOKUP,      
            parent: null,        //< A link to the expression we are used in. If we are used on it's own, this will likely be null.
                                 // e.g. in `thing.x( y )`, `thing` should point to the method call, `y`, should be solitary.
            name:identifier,
            scope,               //< One of the SCOPE_XXX consts telling where this was found.
            defaultValue,        //< The <expr> node if defaulted via `x = <expr>`. `undefind` when missing - but probably should be null.
            option,              //< bool: true if this has an `@option` decorator.
            typename,            //< string: if it has an @option decorator, this is the type name supplied as an argument to the decorate, or ''.
            write,               //< bool: on the rhs of an arrow assign.   
        };
    }

export function
createObjectLiteral( value )
    {
        return { 
            type: TYPE_OBJECT, 
            value // Entries array. FIXME: should be called entries. 
        }
    }

export function 
createArrayLiteral( value ) { 
    return { type: TYPE_ARRAY, value };
}

export function 
createBinary( op, lhs, rhs, { defaulted = false, pipeIndex = 0, exprType = undefined } = {} )
    {
        return { 
            type: TYPE_BINARY, 
            op, lhs, rhs, defaulted, 
            pipeIndex,
            exprType,  //< Principally, the {basetype,enum} for TYPE_ASSERTION. But it can be
                       //  used wherever we can infer the type of the expression.
        };
    }

export function 
createDynamicCast( node, cast )
    {
        // A cast expression could produce a promise...
        return { type: TYPE_UNARY, 
        
                op: UNARY_CAST, object: node, cast, dynamic: true, sync: false };
    }

export function 
createSubscript( object, subscripts, options )
    {
        if ( typeof options !== 'undefined' )
            throw new TypeError( "Illegal options" );
        if ( typeof subscripts === 'function' ) {
            throw new TypeError( "Not supported" );
        }
        let property, start, end;
        if ( typeof subscripts === 'object' ) {
            ({start,end} = subscripts );
        } else if ( typeof subscripts !== 'undefined' ) {
            property = subscripts;
        } else {
            throw new TypeError( "subscripts may not be undefined" );
        } 
            
        // FIXME: This is a binary op! Why is it labelled UNARY?
        return {
            type: TYPE_UNARY,
            op: UNARY_INDEX,
            object,
            property,
            start,
            end,
         }
    }

export function
createUnary( op, object, { exprType } = {} )
    {
        return {
            type: TYPE_UNARY,
            op,
            object,
            exprType
        };
    }

function
_createInvocation( type, name, object, args = [], {new:constructor = false, import:isImport = false } = {} )
    {
        return {
            type,
            new: constructor,
            object,
            name,
            args,
            import:type === TYPE_CALL && isImport,
        };
    }

export function
createCall( name, args = [], options )
    {
        return _createInvocation( TYPE_CALL, name, null, args, options );
    }

export function
createMethod( name, object, args = [], options )
    {
        const node = _createInvocation( TYPE_METHOD, name, object, args, options );
        object.parent = node;
        return node;
    }

export function
createAwait( object )
    {
        return createUnary( UNARY_SYNC, object );
    }

export function
createRest( object )
    {
        return createUnary( UNARY_REST, object );
    }

export function
createTernary( condition, trueExpr, falseExpr )
    {
        return { 
            type: TYPE_TERNARY,
            condition,
            true: trueExpr,
            false: falseExpr
        };
    }

export function
createCapture( sourceValue, destIdentifier, typeAssertion )
    {
        return { 
            type: TYPE_CAPTURE,
            sourceValue, 
            destIdentifier, 
            typeAssertion
        };
    }

/// @brief Currently used for value comparison.
/// A specialist functions means, when we add sourceIndices, we
/// can ignore them.
export function
sameValue( node1, node2 ) {
    // Convienece, and true.
    if ( typeof node1 === 'undefined' && typeof node2 === 'undefined' )
        return true;
    if ( node1.type !== TYPE_VALUE || node2.type !== TYPE_VALUE )
        throw new Error( "Cannot compare nodes" );
    if ( node1.async !== false || node2.async !== false )
        throw new Error( "Async should be false on all nodes" );
    return Object.is( node1.value, node2.value );
}




