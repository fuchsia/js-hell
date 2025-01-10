import isIterator from "../utils/isIterator.mjs";
import {TYPE_LOOKUP,TYPE_CALL,TYPE_ARRAY,TYPE_OBJECT,TYPE_VALUE,TYPE_BINARY,TYPE_UNARY,TYPE_TERNARY, TYPE_CALLBACK,
        UNARY_INDEX,UNARY_SYNC,UNARY_REST, TYPE_METHOD, TYPE_CAPTURE, UNARY_TYPEOF, UNARY_LOGICAL_NOT, 
        BINARY_ALT, BINARY_SUBSCRIPT, BINARY_PIPE, BINARY_TYPE_ASSERTION, BINARY_COMMA, BINARY_INSTANCEOF,
        BINARY_EQUALS, BINARY_NOTEQUALS,
        SCOPE_GLOBAL, SCOPE_IMPORT, SCOPE_LOCAL,
        } from "./ast.mjs";
import Outputter from "./Outputter.mjs";
import createLocal from "./createLocal.mjs";
import {ASYNC_CONTEXT} from "./consts.mjs";
import _Object_in from "../utils/Object_in.mjs";
import json_q from "../utils/json_q.mjs";
import NanO from "./NanO.mjs";
import {privateScope,realiseTo} from "../symbols.mjs";
import * as Deferral from "./Deferral.mjs";
import * as Build from "./Build.mjs";
const TYPENAME_BOOL = 'Boolean'; // Should this be `boolean`? 
import inspector from "node:inspector";
import {ExprType_toString,AS_ASYNC_ITERATOR, AS_ITERATOR, AS_ARRAY, AS_SCALAR} from "./ExprType.mjs";
import {valueForEquals,_typeof_} from "../consts.mjs";

export const ERROR_FAILED_TYPE_ASSERTION = "failed type assertion";

function
Object_in( object, propertyName )
    {
        // Q: should this use enumerable as the scoping mechanism?
        // A: No. Finding the property descriptor would mean walking the prototype chain.
        // It would also be no good for functions which are non-enumerable by default.
        if ( !_Object_in( object, propertyName ) )
            return false;
        const unscopables = object[privateScope]; 
        if ( typeof unscopables === 'object' && unscopables )
            return !unscopables.has( propertyName );
        return true;
    }

function
Object_fromFlatEntries( entries ) {
    const result = {};
    for ( let i = 0; i + 1 < entries.length; i += 2 ) {
        result[entries[i]] = entries[i+1];
    }
    return result;
}

function
Context_pushLocal( context, newLocals ) {
    return createLocal( context, [ 'locals', createLocal( context.locals, newLocals ) ] );
}

function
realisesAsError( object )
    {
        return object?.[realiseTo] === 'Error' && typeof object.toError === 'function'; 
    }

function
needsRealisation( object )
    {
        return typeof object?.[realiseTo] === 'string' && object[realiseTo] !== ''; 
    }

function 
castScalar( value, realiseTo )
    {
        if ( typeof value === 'undefined' ) {
            if ( realiseTo === TYPENAME_BOOL )
                return false;
            return NanO.fromMissingCast( "cast", "Undefined", cast );
        }
        // This was the old `X to X` preserves null rule. 
        if ( value === null || realisesAsError( value ) ) {
            if ( realiseTo === TYPENAME_BOOL )
                return false;
            return value;
        }
        const to = value[`to${realiseTo}`];
        if ( typeof to !== 'function' ) 
            return NanO.fromMissingCast( value.constructor.name, realiseTo );
        return Reflect.apply( to, value, [] );
    }

/// Misleading name. Rejects obvious problems. And tells you whether you
/// need to look deeper for realisation.
function
realiseAsValue( value )
    {
        if ( typeof value === 'function' )
            throw new TypeError( "cannot realise a function" );
        if ( typeof value !== 'object' || !value )
            return true;
        if ( value instanceof Error )
            throw value;
        return false;
    }

/// @brief Certain "abstract" types need to be turned into concerete ones.
/// Should be in the tupe lib, along with castScalar?
///
/// This is a work around. After parsing the "binding" we 
/// which variables are used and how. So getDictionary should properly cast them.
///
export function 
realise( value, parameters )
    {
        // 2024_5_22: We want to allow our fetch() to be passed through; this makes it
        // happen.
        if ( typeof value === 'function' && value[realiseTo] === value )
            return value;
        if ( realiseAsValue( value ) )
            return value;
        const to = value[realiseTo] || value.constructor[realiseTo]; 
        // This better not fail...
        if ( typeof to  === 'string' ) {
            // 2022_10_4: castScalar won't do error casting; 
            // just return it. That may be good.
            if ( to === 'Error'  ) {
                if ( typeof value.toError === 'function' )
                    throw value.toError();
                throw new TypeError( "Cannot realise as error" );
            }
            const result = castScalar( value, to, parameters );
            if ( to === 'String' && typeof result !== 'string' ) {
                throw new TypeError( "Cast failed!" );
            }
            if ( realiseAsValue( result ) )
                return result;
            if ( realisesAsError( result ) )
                return result;
            const to2 = result[realiseTo] || result.constructor[realiseTo];
            // We don't necessary want to realise it. But.
            if ( typeof to2 === 'undefined' )
                return result;
                 
            throw new TypeError( "Realised result needs to be realised itself" );
        }
        
        // Why can't these now have `realiseTo`?
        if ( value.constructor.name === 'Integer' )
            return value.toSafeInteger();
        if ( value.constructor.name === 'LazyFileSync' )
            return value.toFile();
        if ( isIterator( value ) )
            return realiseGenerator( value );
        
        /// 2022_9_30: This completelty re-enumerates every binding. And it shouldn't actually need to go 
        /// that deep; any built object should have been realised on route. 
        //  
        if ( Array.isArray( value ) ) {
            const array = value;
            for ( let i = 0; i < array.length; ++i ) {
                const newValue = realise( array[i], parameters );
                if ( newValue !== array[i] ) {
                    array[i] = newValue;
                }
            }
            return array;
        } else {
            const object = value;
            for ( const key in object ) {
                if ( !Object.hasOwn( object, key ) )
                    continue;
                const newValue = realise( object[key], parameters );
                if ( newValue !== object[key] ) {
                    object[key] = newValue;
                }
            }
            return object;
        }
    }

// Should we just add a noThrow param to realise?
// Should it ever throw? Just return the Error and let
// it be handled?
function
safeRealise( value, parameters ) {
    if ( realisesAsError( value ) )
        return value;
    else
        return realise( value );
}

function*
realiseGenerator( iterator, parameters )
    {
        for ( const value of iterator ) 
            yield realise( value, parameters );
    }

function
isAtable( value )
    {
        if ( Array.isArray( value ) )
            return true;
        
        if ( typeof value === 'object' && value
             && typeof value.length === 'number' && typeof value.at === 'function' )
             return true;
        
        return false;
    }
        
function
isSliceable( value )
    {
        if ( Array.isArray( value ) )
            return true;
        
        if ( typeof value === 'object' && value
             && typeof value.length === 'number' && typeof value.slice === 'function' )
             return true;
        
        return false;
    }

// asarPack becomes pack( $2.map( f => ({ f.name, data: f.buffer() }) ) as Buffer >-> $1 
function 
slice( value, subscripts, name = "" )
    {
        // 2022_9_26: This is a mistake in js-hell.
        if ( typeof subscripts === 'undefined' ) 
            throw new TypeError( "Shouldn't be slicing with undefined" );
        
        // 2022_9_26: propagate NanO
        if ( realisesAsError( value ) ) {
            value.convertToException();
            return value;
        }

        // 2022_9_26: `x.something().y` is one way to get this. It shouldn't be possible
        // though. We shouldn't allow that. (Except `( await fileSystemDirectoryEntry.file() ).x` )
        //  
        // You could also probably code `undefined.x`
        if ( typeof value === 'undefined' || ( typeof value === 'object' && value === null ) )
            return NanO.fromUnindex();
                    
        if ( isIterator( value ) ) {
            if ( subscripts === Symbol.iterator ) 
                return value;
            
            // We could reasonably infill Iterator_slice().
            throw new TypeError( "Probably not supported" );
            // This makes sense; e.g. `count-files FILE... :: ($1.length)
            // `$1` will be an iterator and we need to convert it to the length.
            // FIXME: the original now needs to be stored as an array; this should be
            // a discriminated union forced into an array.  
            value = Array.from( value );
        }
        
        if ( typeof subscripts === 'string'  ) {
            // This could throw.
            const propertyName = subscripts;
            // This means `x.s ?? y` will return `y` if `s` doesn't exist; i.e. it behaves like `x?.s`
            // 2022_10_1: do we want to implement `?.` differently? We could have NanO realise as 
            // `undefined` so `x?.y.z` generates an error that `z` doesn't exist in undefined.
            // It would also mean `x?.z` is `x.z ?? undefined` 
            if ( !Object_in( value, propertyName ) )
                return NanO.fromMissingProperty( propertyName, name );  
            return Deferral.wrap( value[propertyName] );
        }
        if ( typeof subscripts === 'function' ) {
            throw new TypeError( "Cannot index with function" );
        }
        if ( typeof subscripts === 'number' ) {
            if ( !isAtable( value ) ) 
                return NanO.fromMissingProperty( subscripts, name );
            if ( subscripts >= value.length || subscripts < -value.length ) 
                return NanO.fromIndexOutOfRange( );
            return Deferral.wrap( value.at( subscripts ) );
        // 2022_10_4: Historic slice. But still used for indefinite arrays?
        } else if ( typeof subscripts === 'object' ) {
            if ( !isSliceable( value ) )
                throw new TypeError( "Not a sliceable type" ); 
            if ( typeof subscripts.start !== 'undefined' ) {
                if ( subscripts.start < 0 ||
                     subscripts.start >= value.length ||
                     // Undefined will pass all these, albeit not efficientyly.
                     subscripts.end < 0 || 
                     subscripts.end  >= value.length || 
                     subscripts.end < subscripts.start  ) 
                    throw new TypeError( "Subscript out of range" );
            } else if ( typeof subscripts.end !== 'undefined' ) {
                // We could allow `array[..4]` as short for `array[0..4]` I suppose.
                throw new TypeError( "Cannot have definite subscript with indefinite end" );
            } 
            return value.slice( subscripts.start, subscripts.end );
        
        } else if ( typeof subscripts === 'symbol' ) {
            throw new TypeError( "Symbol properties not supported" );
        } else { 
            throw new TypeError( "Unsupported subscripts" );
        }
    }

function
getSubscripts( node )
    {
        if ( node.type === TYPE_UNARY && node.op === UNARY_INDEX ) {
            // 2022_10_4: Legacy: we should only use property; but
            // start and end may be present for an indeterminate array.
            return typeof node.property !== 'undefined' ? node.property : node;
        } else {
            throw new TypeError( "Cannot get subscript" );
        }
    }


function
buildValueInvocation( node, context  )
    {
        const  {globals,imports,locals} = context;
        console.assert( node.type === TYPE_LOOKUP || node.type === TYPE_CALL, "value invocation on node type %s", node.type );
        const {name}=node;
        const scope = node.type === TYPE_LOOKUP ? node.scope : node.import ? SCOPE_IMPORT : SCOPE_GLOBAL;
        if ( scope !== SCOPE_GLOBAL && typeof node.defaultValue !== 'undefined' )
            throw new Error( json_q`Failed invariant: non-global binding ${node.name} has a default value` );  
        if ( scope === SCOPE_LOCAL ) {
            if ( Object_in( locals, name )  ) { // Should this be safe enough to use `name in locals`?
                return locals[name];
            } else {
                throw new Error( json_q`Binding ${node.name} flagged as LOCAL is not in the locals` );
            }
        } else if ( scope === SCOPE_IMPORT ) {
            if ( imports.has( name ) ) {
                return imports.get( name )
            } else {
                throw new Error( json_q`Binding ${node.name} flagged as an IMPORT is not in the imports` );
            }
        } else {
            if ( scope !== SCOPE_GLOBAL ) 
                throw new Error( json_q`Binding ${node.name} has unknown scope ${scope}` );
            if ( globals.has( name ) ) {
                return globals.get( name )
            } else if ( typeof node.defaultValue !== 'undefined' ) {
                return buildExprInvocation( node.defaultValue, context );
            } else {
                return NanO.fromMissingGlobal( name );
            }
        }
    }

const NEW = {};
function
_buildCall( f, name, thisValue, args )
    {
        try {
            if ( realisesAsError( args ) )
                return args;
            if ( realisesAsError( thisValue )  )
                return thisValue;
            if ( realisesAsError( f ) )
                return f;
            // FIXME: this should be a deferral, come what may.
            const result = thisValue === NEW ? Reflect.construct( f, args ) : Reflect.apply( f, thisValue, args );
            return Deferral.wrap( result );
        } catch ( err ) {
            // Javascript madness: derived errors. Easier to do this, I think.
            const e = new Error( `${name}() threw an exception`, { cause: err } );
            e.name = "ScriptletError";
            throw e;
        }
    }
function
buildCall( f, name, object, nodeArgs, context )
    {
        const args = buildArrayInvocation( nodeArgs, context, true );
        return Build.then( 
            f, 
            f => Build.then(
                object, 
                object => 
                    Build.then( 
                        args, 
                        args => _buildCall( f, name, object, args )
                    ) 
            )
        );
            
    }

function 
getClassNameForDynamicPatching( object )
    {
        // 2022_10_15: 
        //  - (function*(){})[Symbol.toStringTag] === 'Generator'
        //  - (function*(){}).constructor === GeneratorFunction
        //  - (function*(){}).constructor.name === ''
        //
        //  - [].values()[Symbol.toStringTag] === 'Array Iterator'
        //  - [].values().constructor === Object
        //  - [].values().constructor.name === ''
        //
        // Rinse and repeat for MapIterator and SetIterator.
        //
        // We could capture all the prototypes and match or
        // at least check the toStringTag is on the prototype.
        // But what's the point? If we're faking it, we're doing it
        // deliberately. isIterator will spot something that probably
        // should have an iterator protoype. 
        if ( isIterator( object ) )
            return "Iterator";
        const obviousName = object?.constructor?.name;
        if ( typeof obviousName === 'string' )
            return obviousName;
        return "";
    }

function 
getOverideName( object, methodName ) {
    // This is for statics, e.g; `String.xxx`. This has to come first, because functions 
    // are instanceces of objects and the code below will happily turn it into
    //  `"%Function.prototype%"`.
    if ( typeof object === 'function' ) {
        const functionName = object.name;
        if ( functionName !== '' ) {
            return `%${functionName}%.${methodName}(...)`;
        } else {
            return "";
        }
    }
    const className = getClassNameForDynamicPatching( object );
    if ( className !== '' ) {
        // 2022_10_15: This is really inefficient. But we are not heavily used.
        return `%${className}.prototype%.${methodName}(...)`;
    }  
    return '';
}

function
_lookupMethod( object, methodName, patches ) {
    // We need to check the patches first, since they have priority.
    if ( typeof methodName === 'string'  ) {
        if ( typeof patches === 'object' ) {
            const override = getOverideName( object, methodName );
            if ( override !== '' && patches.has( override ) ) {
                // NB this may be undefined (?or NanO) if somebody is blocking it.
                return patches.get( override );
            }
        }
    } else if ( typeof methodName !== 'symbol' ) {
        throw new TypeError( "`methodName` must be a symbol or a string" );
    } 
    // 2022_10_12: This does checking for private variables. That may now be
    // redundent and should be replaced via flying monkeys thay intercept the
    // call. If that happens, this can be removed since the caller checks
    // its executable.
    if ( !Object_in( object, methodName ) ) 
        return NanO.fromMissingMethod( methodName, object.constructor.name );
    return object[methodName];
    
}

function
lookupMethod( object, methodName, patches )
    {
        if ( realisesAsError( object ) ) {
            object.convertToException();
            return object;
        }
        const method = _lookupMethod( object, methodName, patches );
        if ( typeof method !== 'function' )
            return NanO.fromMissingMethod( methodName, object.constructor.name  );     
        
        // FIXME: Set up flying monkeys to block these calls.
        //
        // Methods aren't objects so block `f.method.call()`, etc... But NB
        // constructors are functions and can have static methods.
        //
        if ( ( typeof object === 'function' || object instanceof Function  ) && method === Object_in( Function.prototype, methodName ) )
            throw new TypeError( "Cannot invoke function methods" );
        return method;
    }

/// @brief Check whether value matches the type assertion in node. Return true, to continue checking
/// false to give up (a warning has been issued), and throws if type checking fails.
function
typeCheckValue( context, node, value, exprType ) {
    const passed = buildAnyInvocation( node, Context_pushLocal( context, [ '%', value, ]  ) );
    if ( passed !== true ) {
        // Should this return Nano? i.e. it can be caught?
        if ( passed === false ) 
            throw new TypeError( `${ERROR_FAILED_TYPE_ASSERTION}: expr is not type ${ExprType_toString( exprType )}` );
        console.warn( "warning: unchecked type assertion %s", ExprType_toString( exprType ) );
        return false;
    }
    return true;
}
function
*typeCheckIterator( context, node, iterator, exprType ) {
    for ( const value of iterator ) {
        const checkNext = typeCheckValue( context, node, value, exprType );
        yield value;
        if ( !checkNext ) {
            yield *iterator;
            break;
        }
    }
}
async function
*typeCheckAsyncIterator( context, node, asyncIterator, exprType ) {
    for await ( const value of asyncIterator ) {
        const checkNext = typeCheckValue( context, node, value, exprType );
        yield value;
        if ( !checkNext ) {
            yield *iterator;
            break;
        }
    }
}

function
buildBinary( context, lhsValue, rhsNode, op ) {
    return Build.then( lhsValue, 
        lhs => {
            if ( realisesAsError( lhs ) )
                return lhs;
            return Build.then( buildAnyInvocation( rhsNode, context ), rhs => {
                if ( realisesAsError( rhs ) )
                    return rhs;
                return op( lhs, rhs );
            } ); 
        }
     );
}

function
checkConditionCode( cc, opname ) {
    if ( typeof cc === 'boolean' )
        return true;
    if ( realisesAsError( cc ) ) 
        return false;
    throw new TypeError( `Condition to \`${opname}\` must be a boolean.` );
}

function
getValueForEquals( value ) {
    if ( typeof value !== 'object' || !value )
        return value;
    if ( typeof value[valueForEquals] !== 'function' )
        return value;
    return value[valueForEquals]();
}


function
buildExprInvocation( node, context )
    {
        if ( node.type === TYPE_VALUE ) {
            return node.value;
        } else if ( node.type === TYPE_LOOKUP ) {
            return buildValueInvocation( node, context );
        } else if ( node.type === TYPE_UNARY ) {
            const objectExpr = buildExprInvocation( node.object, context );
            if ( node.op === UNARY_INDEX ) {
                const subscripts = getSubscripts( node );
                // NB. `slice()` does the realisesAsError() test and that if we override this
                // we need to call `convertToException()`. 
                return Build.then( objectExpr, object => slice( object, subscripts, "" ) );
            } else if ( node.op === UNARY_SYNC ) {
                return Build.then( objectExpr, promise => Deferral.unwrap( promise ) );
            } else if ( node.op === UNARY_TYPEOF ) {
                return Build.then( objectExpr, object => {
                    if ( realisesAsError( object ) ) {
                        return object.isException === false ? "undefined" : object;
                    }
                    // 2024_8_21: A huge gotcha, I'll probably regret. 
                    if ( object === null )
                            return "null";
                    const t = typeof object;
                    if ( t !== 'object' )
                        return t;
                    // Used by the Integer type - which can be either BigInt or Number.
                    if ( typeof object[_typeof_] === 'string' )
                        return object[_typeof_];
                    return t;
                });
            } else if ( node.op === UNARY_LOGICAL_NOT ) {
                return Build.then( objectExpr, cc => checkConditionCode( cc, '!' ) ? !cc : cc );
            } else {
                throw new TypeError( "Unknown unary operation" );
            } 
        } else if ( node.type === TYPE_CALL ) {
            // 2024_4_26: We don't need `Build.then()` here as our grammar doesn't allow calling 
            // arbitrary objects - i.e. `operator()()`; so, e.g., `(await x)()` is not legal. The 
            // only awaits, can be in the arguments, which is not our problem.  
            //
            const f = buildValueInvocation( node, context );
            if ( realisesAsError( f ) )
                return f;
            // FIXME: this should be a NanO, too.
            if ( typeof f !== 'function' ) {
                throw new TypeError( `JSON.stringify( f ) is not callable` );
            }
            return buildCall( f, node.name, node.new ? NEW : undefined, node.args, context );
            
        } else if ( node.type === TYPE_METHOD ) {
            const methodName = node.name;
            // Q: Do we not need to realise object before calling?
            // A: No.
            //
            // As of 2022_10_8, you can't call arbitary methods *directly*.
            // If you are calling a method, it is a method the object provided
            // and so realisation is (a) unnecessary and (b) would break code.
            // 
            // Attempts to circumvent this would generate object realisation;
            // e.g. `someFile.text.call( someFile )` would fail even if
            // you could use methods on functions. (2024_11_22: Why? I don't see that.) 
            //
            // Javascript sees functions as a fundamental type. We deliberately do not allow 
            // that largesse in an attempt to make this more type safe; methods
            // are part of the object and can only be called on the object they are
            // defined on.
            //
            // NB This means we need to block `Function.prototype.call etc...` and 
            // `Reflect`.
            //
            // 2024_11_22: Switched from `buildExprInvocation` to `buildAnyInvocation` without much thought;
            // but it is needed for templates. Which are expressed as `[].join()` and, are, really, a case
            // where `Array.prototype.join( args, '' )` would make more sense - contrary to the above.
            // (I wonder how many of these `buildExprCall()` should be `buildAnyCall`?)   
            const thisExpr = buildAnyInvocation( node.object, context, methodName === Symbol.iterator );
            // `(await fetch()).method()`
            const method = Build.then( thisExpr, thisValue => lookupMethod( thisValue, methodName, context.globals ) );
            return buildCall( method, methodName, node.new ? NEW : thisExpr, node.args, context );
        } else if ( node.type === TYPE_BINARY ) {
            // Q: Does this have to be an expression. Or can we use `buildAnyInvocation`?    
            const value = buildExprInvocation( node.lhs, context );
            if ( node.op === BINARY_ALT ) {
                
                // 2022_9_24: this means `undefined ?? x` will return `undefined`.
                // FIXME: we should be able to do the build now, irrespective of whether the value is used. We can't because Build
                // invokes immediately.
                return Build.then( value, value => !realisesAsError( value ) ? value : buildExprInvocation( node.rhs, context ) ); 
            } else if ( node.op === BINARY_SUBSCRIPT ) {
                const lhs = value;
                if ( realisesAsError( lhs ) )
                    return lhs;
                const object = lhs;
                const subscript = buildExprInvocation( node.rhs, context );
                if ( realisesAsError( subscript ) )
                    return subscript;
                if ( !"allow `thing[await subscript]`" ) {
                    // 2024_4_26: Untested. And is there a good case?
                    return Build.then( object, object => Build.then( subscript, subscript => object[subscript] ) );
                } else {
                    return Build.then( object, object => object[subscript] );
                }
            } else if ( node.op === BINARY_TYPE_ASSERTION ) {
                return Build.then( value, 
                    value => {
                        if ( realisesAsError( value ) )
                            return value;
                        // 2024_8_19: We expect the typecheck to be synchronous, so we have no need for `Build.then()`
                        // (and can't use it for the iterators).
                        if ( node.exprType.enum === AS_SCALAR ) {
                            typeCheckValue( context, node.rhs, value, node.exprType );
                            return value;
                        } else if ( node.exprType.enum === AS_ARRAY ) {
                            value.every( subvalue => typeCheckValue( context, node.rhs, subvalue, node.exprType ) );
                            return value;
                        } else if ( node.exprType.enum === AS_ITERATOR ) {
                            return typeCheckIterator( context, node.rhs, value, node.exprType );
                        } else if ( node.exprType.enum === AS_ASYNC_ITERATOR ) {
                            return typeCheckAsyncIterator( context, node.rhs, value, node.exprType );
                        } else {
                            throw new Error( json_q`Internal error (unknown enum type ${node.exprType.enum})` );
                        }  
                    }
                );
            } else if ( node.op === BINARY_PIPE ) {
                // This is special, so shouldn't be a binary.
                if ( realisesAsError( value ) )
                    return value;
                return Build.then( value, value => buildAnyInvocation( node.rhs, Context_pushLocal( context, [ '%', value, `%` + node.pipeIndex, value ]  ) ) );
            } else if ( node.op === BINARY_INSTANCEOF ) {
                return buildBinary( context, value, node.rhs, ( lhs, rhs ) => lhs instanceof rhs );
            } else if ( node.op === BINARY_EQUALS ) {
                return buildBinary( context, value, node.rhs, ( lhs, rhs ) => getValueForEquals(lhs) === getValueForEquals(rhs) );
            } else if(  node.op === BINARY_NOTEQUALS ) {
                return buildBinary( context, value, node.rhs, ( lhs, rhs ) => getValueForEquals(lhs ) !== getValueForEquals(rhs ) );
            } else if ( node.op === BINARY_COMMA ) {
                return buildBinary( context, value, node.rhs, ( lhs, rhs ) =>  rhs );
            } else {
                throw new TypeError( "Unknown binary operation" );
            }
        } else if ( node.type === TYPE_TERNARY ) {
            return Build.then(  
                buildExprInvocation( node.condition, context ),
                cc => {
                    if ( !checkConditionCode( cc, "?:" ) )
                        return cc;
                    return buildExprInvocation( cc ? node.true : node.false, context );
                }
            )
        } else if ( node.type === TYPE_CAPTURE ) {
            return Build.then(  
                buildExprInvocation( node.sourceValue, context ),
                value => {
                    const destObject = buildValueInvocation( node.destIdentifier, context );
                    const returnValueReceiver = new Outputter( destObject, node.typeAssertion, {} );
                    return Build.then( 
                        returnValueReceiver.setValue( value ),
                        result => {}
                    );
                }
            )
        } else {
            throw new TypeError( `Unknown node type ${JSON.stringify( node.type )}` );
        }
    }

let inspecting = false;
function 
buildArrayInvocation( invocationArgs, context, argList = false )
    {
        const argValues = [];
        let hasPromises = false;
        if ( !inspecting  ) {
            false && inspector.open( undefined, undefined, true );
            inspecting = true;
            debugger;
        }
        // We could put off deferrals to here. That means we can separate literal code
        // from stuff that will have dynamic values. We also need to be able to spot
        // real promises.
        for ( const term of invocationArgs ) {
            let value;
            if ( term.type === TYPE_ARRAY ) {
                value = buildArrayInvocation( term.value, context );
            } else if ( term.type === TYPE_OBJECT ) {
                value = buildObjectInvocation( term.value, context );
            } else if ( term.type === TYPE_UNARY && term.op === UNARY_REST ) {
                // 2022_9_30: Does this need to be realised? It's an iterable! Is there
                // anything not an iterable that realises as an iterable?
                const exprResult = realise( buildExprInvocation( term.object, context ), context.globals );
                // FIXME: we should aggregate all NanOs and return a single object.
                if ( !realisesAsError( exprResult ) ) {
                    if ( isIterator( exprResult ) ) {
                        argValues.push( ...exprResult );
                    } else if ( typeof exprResult[Symbol.iterator] === 'function' ) {
                        const rest = exprResult[Symbol.iterator]();
                        argValues.push( ...rest );
                    } else {
                        throw new TypeError( "expected iterable for rest arg" );
                    }
                    continue;
                } else {
                    value = exprResult;
                }
            } else if ( term.type === TYPE_CALLBACK ) {
                if ( !argList )
                    throw new Error( "Callbacks are only allowed in argument lists" );
                // This has to be a closure, because it's 
                // FIXME: should we split this into two functions for sync and async?
                const {expr,freeVariableNames,async}=term;

                const callback = ( ...values ) => {
                    // FIXME: we can spot the binding during passing (either retroespectively or
                    // at the time) and hard bind it so we don't have to encode the name.
                    const newLocalBindings = [ ASYNC_CONTEXT, async ];
                    for ( let i = 0; i < freeVariableNames.length; ++i ) {
                        newLocalBindings.push( freeVariableNames[i], i < values.length ? values[i] : undefined  );
                    }
                    const newContext = Context_pushLocal( context, newLocalBindings );
                    const exprResult = buildAnyInvocation( expr, newContext );
                    // This would be okay if we are async, but we would need to realise.
                    if ( exprResult instanceof Promise ) {
                        if ( !async && false )
                            throw new TypeError( "Cannot return asynchronous results from callback" );
                        return exprResult.then( unwrappedValue => realise( unwrappedValue, context.globals ) );
                    } else {
                        const realisedResult = realise( exprResult, context.globals );
                        return async ? Promise.resolve( realisedResult ) : realisedResult;
                    } 
                        
                };
                argValues.push( callback );
                continue; 
            } else {
                const exprResult = buildExprInvocation( term, context ) ;
                value = realisesAsError( exprResult ) ? exprResult : realise( exprResult, context.globals );
            }
            // FIXME: we should aggregate all NanOs and return a single object.
            // FIXME: if this is a Deferral, we can't see it's an error.
            if ( realisesAsError( value ) )
                return value;
            if ( !hasPromises && value instanceof Promise )
                hasPromises = true;
            argValues.push( value );
            /*if ( !term.async && value instanceof Promise ) {
                const argIndex = argValues.length;
                promises.push( value.then( trueValue => {
                    // 2022_10_20: Does this need realising?
                    if ( needsRealisation( trueValue ) )
                        throw new Error( "assert: value shouldn't need realisation" );
                    argValues[argIndex] = trueValue;
                }) );
                // FIXME: we could have the actual object if it is an Array or an Object;
                // but they would need to return it, in some way. (We could then accumulate the
                // list of promises into a single list.)
                argValues.push( undefined ); // Will make us super popular. 
            } else {
                argValues.push( term.async ? Promise.resolve( value ) : value );
            }*/
        }
        // FIXME: elide Deferral.unwrapAll if there are no deferrals.
        if ( hasPromises ) {
            return Promise.all( argValues  ).then( resolvedValues => Deferral.unwrapAll( resolvedValues ) ); 
        } else {
            return Deferral.unwrapAll( argValues );
        }
    }

function 
buildObjectInvocation( invocationArgs, context )
    {
        const objectEntries = [];
        let hasPromises = false; 
        for ( const [property,term] of invocationArgs ) {
            objectEntries.push( property );
            let value;    
            if ( term.type === TYPE_ARRAY ) {
                value = buildArrayInvocation( term.value, context );
            } else if ( term.type === TYPE_OBJECT ) {
                value = buildObjectInvocation( term.value, context );
            } else {
                // Should buildExprInvocation do realisation of result?
                const exprResult = buildExprInvocation( term, context ) ;
                value = Build.then( exprResult, exprResult => safeRealise( exprResult, context.globals ) );
            }
            // FIXME: we should aggregate all NanOs and return a single object.
            if ( realisesAsError( value ) )
                return value;
            if ( !hasPromises && value instanceof Promise ) 
                hasPromises = true;
            objectEntries.push( value );
        }
        if ( !hasPromises ) {
            return Object_fromFlatEntries( Deferral.unwrapAll( objectEntries ) );
        } else {
            return Promise.all( objectEntries ).then( resolvedEntries => Object_fromFlatEntries( Deferral.unwrapAll( resolvedEntries ) ) );
        }
    }

function
buildAnyInvocation( expr, context )
    {
        return expr.type === TYPE_ARRAY  ? buildArrayInvocation( expr.value, context )
             : expr.type === TYPE_OBJECT ? buildObjectInvocation( expr.value, context )
             : buildExprInvocation( expr, context );
    }


export function 
_buildInvocation( invocation, parameters, formatterParams = undefined, throwError = true, imports )
    {
        // 2024_11_27: Historic code - mop up any old calls that have been missed.
        if ( Array.isArray( invocation.args ) ) 
            throw new TypeError( "Non-expression invocation no longer supported" );

        if ( typeof formatterParams !== 'object' && typeof formatterParams !== 'undefined' ) {
            console.log( formatterParams ); 
            throw new TypeError( "Expected object for formatterParams" );
        }
         
        const // Can we get away without this being an sync context? Does that help in anyway?
              locals = createLocal( null, [ ASYNC_CONTEXT, true ]  ), //< FIXME: move this into the context itself, a la parse.
              context = {
                globals:parameters,
                imports:typeof imports === 'undefined' ? parameters : new Map( Object.entries( imports ) ),
                locals},  
              _result = Build.then( buildAnyInvocation( invocation.args, context ), exprValue => safeRealise( exprValue, parameters ) ); 
        
        const result = !throwError ? _result : Build.then( _result, possibleError => {
            // Should we also check for instances of Error? i.e. if we have `with() new Error("bad")` shold that throw?
            if ( !realisesAsError( possibleError ) ) 
                return possibleError;
            throw possibleError.toError();
        } );
        
        return result;
    }

export default function 
buildInvocation( invocation, parameters, formatterParams = undefined, throwError = true, imports )
    {
        const result = _buildInvocation( invocation, parameters, formatterParams, throwError, imports ); 
        
        // 2024_11_27: FIXME: there are lots of test cases that depend on this old format.
        return {
            name: undefined,
            args: result,
            resultTypeAssertion: invocation.cast 
        }
    }
    

