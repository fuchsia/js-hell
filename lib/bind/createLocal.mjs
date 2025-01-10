export default function 
createLocal( localBindings = null, params ) {
    const nextContext = Object.create( localBindings );
    for ( let i = 0; i < params.length; i += 2 ) {
        const name = params[i],
              value = params[i+1];
        Object.defineProperty( nextContext, name, { value, writable: false, configurable: false, enumerable: true  } );
    }
    return nextContext;
}