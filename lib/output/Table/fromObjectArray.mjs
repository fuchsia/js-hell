/* Stolen from Table 0bc32b7e620e  Sat May 27 14:44:04 2023 +0100 */

import Column from "./Column.mjs";
/// @brief Create an array of columns where each entry in arrayOfObjects
/// is viewed as a row and it's property names are the column names.
///
/// @param `fill` Any missing parameter in the array is filld with this value.
///
/// @issue Should we allow different fills for different colums? e.g. a record
/// which is used for filling (and a default fill for missing ones)?
export function 
fromObjectArray( arrayOfObjects, fill )
    {
        const columnMap = new Map;
        for ( let rowIndex = 0; rowIndex < arrayOfObjects.length; ++rowIndex ) {
            for ( const [key,value] of Object.entries( arrayOfObjects[rowIndex] ) ) {
                if ( !columnMap.has( key ) ) {
                    columnMap.set( key, new Column( key ) );
                }
                columnMap.get( key ).setAt( rowIndex, value, fill );                        
            }
        }
        // FIXME: should we be able to return the iterator? Or even the map?
        return Array.from( columnMap.values() );
    }



