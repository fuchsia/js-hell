import {isGenerator} from "../utils.mjs";
import {getCanonicalSuperType} from "../TypeLib.mjs";
import {AS_ITERATOR, AS_ARRAY, AS_SCALAR} from "./consts.mjs";
import {Buffer_fromScalarType,inferFormat,outputComponentsAndCat,isFormatCompatible,FORMAT_CUSTOM_TO_STRING} from "../formatOutput.mjs";
export const
VIA_VECTOR = 'vector',
VIA_STREAM = 'stream',
VIA_BUFFER = 'buffer',
VIA_NULL = 'null';

function
getOutputMethod( basetype, enumAs ) {
    if ( basetype === 'Buffer' && enumAs === AS_ARRAY ) {
        return VIA_VECTOR;
    } else if ( enumAs === AS_ITERATOR ) {
        return VIA_STREAM;
    } else {
        return VIA_BUFFER; 
    }
}

/// @param `outputAssertion` Bind's taken on the `as xxx` type assertion (also called `outputCast`)
function
getOutputParams( outputAssertion = {} ) {
    let { basetype, enum:enumAs} = outputAssertion;
    const typeAsserted = !!outputAssertion;
    if ( typeAsserted ) {
        // It implicitly casts from Buffer, here...
        /*if ( !( receiver instanceof ForStdout ) && ( basetype !== 'Buffer' || enumAs !== AS_ARRAY ) )
            throw new TypeError( "Cannot currently cast with assignment; it should happen automatically x-fingers" );*/
    
        // const o = basetype;
        basetype = getCanonicalSuperType( basetype );
        if ( basetype === 'DirName' || basetype === 'FileName' )
            basetype = 'Str';
    }
    // FIXME: streaming should be supported, too.
    // FIXME: any array buffer vector could be painlessly turned into a buffer vector.
    return {
        typeAsserted,
        basetype,
        enumAs,
        method: getOutputMethod( basetype, enumAs ),
    };
} 

function
getType( value, basetype = '', enumAs = AS_SCALAR )
    {
        const format = inferFormat( value );
        // FIXME: we really want to know the basetype converts to strings...
        if ( format === 'Lines' && enumAs !== AS_SCALAR )
            return basetype;
        
        // 2022_10_24: should cFormat be handling Utf8 stuff above?
        if ( !basetype  ) 
            return format;
        if ( format === FORMAT_CUSTOM_TO_STRING )
            return FORMAT_CUSTOM_TO_STRING;

        if ( !isFormatCompatible( basetype, format ) ) 
            throw new TypeError( `Provided value appears to be ${JSON.stringify(format)} and not ${JSON.stringify(basetype)} as expected` );
        
        return basetype;
    }

function
toBuffer( receiver, value, fromType, rawDictionary, last )
    {
        if ( typeof receiver.toBuffer_fromScalarType === 'function' ) {
            return receiver.toBuffer_fromScalarType( value, fromType, rawDictionary, last )
        } else {
            return Buffer_fromScalarType( value, fromType, rawDictionary, last );
        }
    }

function* 
streamConverter( receiver, source, basetype, rawDictionary )
    {
        for ( const chunk of source ) {
            const fromType = getType( chunk, basetype );
            yield toBuffer( receiver, chunk, fromType, rawDictionary );
        }
    }

class 
Outputter
{
    typeAsserted;        //< Did the binding do `as XXX`?
    basetype;            //< The canonical base type of any type assertion.    
    enumAs;              
    formatParams;        //< A dictionary of the other `--output-xxxx` params that have been set. 
    method;             //< One of the `VIA_XXX` constants.
    

    constructor( outputCast, formatParams )
        {
            const {typeAsserted,basetype,enumAs,method} = getOutputParams( outputCast );
            Object.assign( this, {typeAsserted,basetype,enumAs,formatParams} );
            this.method = method; 
        }

    setReceiverValue( receiver, value )
        {
            const {typeAsserted,basetype,enumAs,formatParams,method}=this;
             
            let fromType;
            /*if ( method === VIA_STDOUT ) {
                receiver.setContents( value, cast, rawDictionary );
                return;  
            } else*/ if ( method === VIA_VECTOR ) {
                if ( typeof receiver.setValueAsBufferVector === 'function' ) {
                    receiver.setValueAsBufferVector( value );
                    return;
                }
                // FIXME: we need to concate it.
            } else if ( method === VIA_STREAM ) {
                if ( typeof receiver.setValueAsBufferStream === 'function' ) {
                    receiver.setValueAsBufferStream( streamConverter( receiver, value, basetype, formatParams ) );
                    return;
                }
                if ( !isGenerator( value ) ) 
                    throw new TypeError( "Not a generator" );
                
                value = Array.from( value );
                fromType = getType( value, basetype, AS_ARRAY ); 
            } else if ( method !== VIA_BUFFER ) {
                throw new TypeError( "Unknown method" );
            } else {
                if ( typeof value === 'undefined' && typeof basetype === 'undefined' )
                    return;
                fromType = getType( value, basetype, enumAs );
                // 2023_2_11: Is this ever used?
                if ( isGenerator( value ) ) {
                    value = Array.from( value );
                }
            }
            
            let outputBuffer;
            // There are various situations where arrays are "scalar" types and not vectors of scalar - e.g. JSON, or lines.
            // The output format might even control which we have. I think it makes sense to require genuine arrays to be
            // asserted as such.  
            if ( Array.isArray( value ) && ( enumAs === AS_ITERATOR || enumAs === AS_ARRAY ) && outputComponentsAndCat( formatParams ) ) {
                outputBuffer = Buffer.concat( value.map( ( v, index ) => toBuffer( receiver, v, fromType, formatParams, index == value.length - 1 ) ) );
            } else {
                outputBuffer = toBuffer( receiver, value, fromType, formatParams, true );
            }
            receiver.setValueAsBuffer( outputBuffer ); 
        }
};

// 2024_8_15: Should we now merge this with the above? Nobody uses the above. It's all now done via the host.
export default class 
BoundOutputter
{
    
    receiver;            //< This is the instantiation of the `--output` option (e.g. `FILE` object that will actually get the result). Some of the tests access this.  
    #outputter;      
    

    constructor( receiver, outputCast, formatParams )
        {
            this.receiver = receiver;
            this.#outputter = new Outputter( outputCast, formatParams ); 
            //const {typeAsserted,basetype,enumAs,method} = getOutputParams( outputCast );
            //Object.assign( this, {receiver,typeAsserted,basetype,enumAs,formatter} );
            //this.#method = method; 
        }

    getMethod()
        {
            return this.#outputter.method;
        }

    setValue( value )
        {
            this.#outputter.setReceiverValue( this.receiver, value );
        }

    
};


