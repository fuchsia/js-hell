
export default function 
Array_accumulate( array, mapFn, joinChar, initial = '' ) {
    let accumulator = `${initial}${mapFn( array[0] )}`;
    for ( let i = 1; i < array.length; ++i ) {
        accumulator = `${accumulator}${joinChar}${mapFn( array[i] )}`;
    }
    return accumulator; 
} 