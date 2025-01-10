
export default function 
Array_mapWithStructure( array, mapper )
    {
        let flatIndex = 0
        const result = [],
              stack = [{source: array, dest:result, branch: 0, branches: 0}];
        while ( stack.length ) {
            const {source, dest, branch, branches } = stack.pop();
            const startIndex = dest.length;
            for ( let i = startIndex; i < source.length; ++i ) {
                if ( Array.isArray( source[i] ) ) {
                    const child = [];
                    stack.push( {source, dest, branch, branches: branches + 1 } );
                    stack.push( {source: source[i], dest: child, branch: branches, branches: 0 } );
                    dest.push( child );
                    break;
                }
                const depth = stack.length;
                // Branches are tracked to spot a grammar issue. 
                dest.push( mapper( source[i], flatIndex++, depth, i, branch ) ); 
            }
        }
        return result;
    }


