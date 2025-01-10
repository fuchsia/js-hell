import {decapitalise} from "../utils.mjs";

function 
getTypeCounts( positionalOptions )
    {
        const typesUsed = new Map;
        for ( let i = 0; i < positionalOptions.length; ++i ) {
            const {key,type:{literal,variant},recurs,orgTypeName} = positionalOptions[i];
            if ( literal || variant )
                continue;
            if ( !typesUsed.has( orgTypeName ) ) { 
                typesUsed.set( orgTypeName, { key, singular: true, index: i, recurs } );
            } else {
                const t = typesUsed.get( orgTypeName );
                if ( t.singular ) {
                    t.singular = false;
                    t.index = [ t.index, i ];
                    t.key = [ t.key, key ];
                    t.recurs = [ t.recurs, recurs ];
                } else {
                    t.index.push( i );
                    t.key.push( key );
                    t.recurs.push( recurs );
                }
            }
        }
        return typesUsed;
    }

function
variableName_fromTypeName( typename, recurs )
    {
        return `\$${decapitalise( typename )}${recurs?'s':''}`
    }

export function
setOldAliases( positionalOptions ) {
    const typeCounts = getTypeCounts( positionalOptions );
    for ( const [orgTypeName,{key,singular,index:logicalIndex,recurs}] of typeCounts.entries() ) {
        if ( !singular ) {
            // FIXME: we want it to be an error to access this alias.
            continue;
        }
        // FIXME: we want to warn users to avoid this.
        positionalOptions[logicalIndex].aliases.add( variableName_fromTypeName( orgTypeName, recurs ) ); 
    }
}
export function
setNewAliases( positionalOptions ) {
    for ( const [identifier,options] of Object.entries( Object.groupBy( positionalOptions, ({orgTypeIdentifier}) => orgTypeIdentifier ) ) ) {
        if ( identifier === ''                   // Historical, this corresponds with a literal. 
            || typeof identifier !== 'string' )  // Prohibit symbols - that makes no sense. 
            continue;
        if ( options.length !== 1 ) {
            for ( const o of options ) {
                // FIXME: we want it to be an error to access these options.
            }  
        } else {
            options[0].aliases.add( identifier );
        }
    }
}







