    
/// @brief Add a piece of code needed for the bind function.
///
/// For now we only worry about promises: any promise we encounter is unwrapped, 
/// and so an operation should be chained onto it. Otherwise it can be done immediately.
/// The aim is we should compose functions to create code that can be reused. 
export function 
then( value, op ) {
    if ( value instanceof Promise ) {
        return value.then( op );
    } else {
        return op( value );
    } 
}


