import Literal from "./types/Literal.mjs";
import types,{casts,TypeRegistration} from "./types/registry.mjs";
const typeRegistry = types;
export {casts};
    
function isCapitalised( text )
    {
        const first = text.charCodeAt( 0 );
        return first >= 65 && first <= 65 + 26;
    }

/// @brief Uppercase the first letter.
function capitalise( text )
    {
        if ( text === '' || isCapitalised( text ) )
            return text;
        return text.slice( 0, 1 ).toUpperCase() + text.slice( 1 );
    }

// Shouldn't this be part of type registration?
function 
createSubtype( typename, subTypename, superTypename )
    {
        if ( !types.has( superTypename ) ) 
            throw new TypeError( `No such supertype ${JSON.stringify(superTypename)} for type ${JSON.stringify( typename )}` );
        
        const s = types.get( superTypename );
        const o = Object.create( s );
        o.super = s; 
        o.subname = subTypename;
        // Object.defineroperty( o, 'name', { value: t, enumerable: true, writable: true, configurable: true} );
        o.name = typename;
        typeof s.updateSubtype === 'function'  
            && s.updateSubtype( o, subTypename );  
        return o;
    }

function 
getTypeOrSubtype( typename )
    {
        const t = typename;
        if ( types.has( t ) ) 
            return types.get( t );
        
        // How annoying search doesn't have a start index. Or doesn't respect last
        const ucIndex = t.slice( 1 ).search( /[A-Z]/ ) + 1;
        if ( ucIndex ) {
            const superType = t.slice( ucIndex );
            const o = createSubtype( t, t.slice( 0, ucIndex ), superType );
            types.set( t, o );
            return o;
        }
        throw new TypeError( `Unknown type ${t}` );
    }

export function 
getOrCreateTypeRegistration( t, key = '' )
    {
        if ( t === 'true' || t === 'false' )
            return t;
        if ( Array.isArray( t ) ) {
            // How is this different to Literal?
            return new TypeRegistration( {
                name: capitalise( key ),
                is: text => t.includes( text ), 
                fromString: text => text,
                enum: true, 
            } );
        }
        if ( typeof t !== 'string' )
            throw new TypeError( `Not a type name ${JSON.stringify(t)}` );
        if ( !isCapitalised( t ) )
            throw new TypeError( `Invalid type name ${JSON.stringify(t)}` );
        return getTypeOrSubtype( t );
    }

export function createLiteral( t, key = 'literal' )
    {
        return new Literal( t, key );
    }

function
compareCodePoints( a, b )
    {
        const N = Math.min( a.length, b.length );
        for ( let i = 0; i < N; ++i ) {
            const cmp = a.charCodeAt( 0 ) - b.charCodeAt( 0 );
            if ( cmp )
                return cmp;
        }
        return a.length - b.length;
    }

export function 
createDiscriminatedUnion( typenames )
    {
        if ( !( typenames.length > 1 ) )
            throw new TypeError( "Not a typename list" );

        if ( !typenames.every( t => typeof t === 'string' ) )
            throw new TypeError( `Not type names ${JSON.stringify(t)}` );
        if ( !typenames.every( t => isCapitalised( t ) ) )
            throw new TypeError( `Invalid type names ${JSON.stringify(t)}` );
        
        // This allows us to overide, e.g. `(Dir|File)`
        typenames.sort( compareCodePoints );
        const canonicalUnionName = `(${typenames.join( '|' )})`;
        if ( typeRegistry.has( canonicalUnionName ) ) 
            return typeRegistry.get( canonicalUnionName );
        
        // FIXME: we could have duplicate types.
        const types = typenames.map( t => getTypeOrSubtype( t ) );
        // Q: Can we not admit they are prototypical and get the prototype?
        const prototype = typeof types[0].super === 'object' && types[0].super ? types[0].super : types[0];
        for ( let i = 1; i < types.length; ++i ) {
            const s = typeof types[i].super === 'object' && types[i].super ? types[i].super : types[i];
            if ( prototype !== s )
                throw new Error( "Invalid discriminated union (all types must have the same supertype" );
        }
        // Q: Should we register this as an object with a defined named in a canonical order?
        const o = Object.create( prototype );
        o.variant = true;
        if ( typeof prototype.updateVariant === 'function' )
            prototype.updateVariant( o, types );  
        return o;
    }

// 2022_8_23: Returns the name that is (a) the supertype (so MjsFile returns `File`)
// and (b) the canonical name (so Str not String). 
export function
getCanonicalSuperType( typename )
    {
        if ( !types.has( typename ) ) 
            return typename;
        
        const t = types.get( typename );
        return t.super ? t.super.name : t.name;
    }

