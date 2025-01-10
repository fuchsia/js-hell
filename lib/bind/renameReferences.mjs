import {TYPE_LOOKUP} from "./ast.mjs";

export default function
renameReferences( globalReferences, oldName, newName ) {
    if ( !globalReferences.has( oldName ) || oldName === newName )
        return false;
    const referencingAstNodes = globalReferences.get( oldName );
    for ( const node of referencingAstNodes ) {
        if ( node.type !== TYPE_LOOKUP )
            throw new TypeError( "Illegal reference" );
        if ( node.name !== oldName )
            throw new TypeError( "Mimsatched names" );
        node.name = newName;
    }
    if ( !globalReferences.has( newName ) ) {
        globalReferences.set( newName, referencingAstNodes );
    } else {
        const extant = globalReferences.get( newName );
        for ( const node of referencingAstNodes ) {
            extant.add( node );
        } 
    }
    globalReferences.delete( oldName );
    return true;
} 