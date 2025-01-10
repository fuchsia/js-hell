import Array_mapWithStructure from "../utils/Array_mapWithStructure.mjs";
import PositionalOption from "./PositionalOption.mjs";
import {setNewAliases,setOldAliases} from "./PositionalMatch.mjs";



/// @brief Remove any arrays from the tree.
function
Array_flatExclude( array )
    {
        return array.filter( n => !Array.isArray( n ) );
        /*const result = [];
        for ( let i = 0; i < array.length; ++i ) {
            if ( Array.isArray( array[i] ) )
                continue;
            result.push( array[i] );
        }
        return result;*/
    }


function
buildLengths( tree )
    {
        const lengths = [];
        for ( ;; ) {
            const b = Array_flatExclude( tree );
            // `[a] [b]`: this is ambiguous.
            if ( b.length < tree.length - 1 )
                throw new TypeError( "Can only have one optional segment" );
            lengths.push( b.length );
            if ( b.length === tree.length ) 
                return { lengths, longestBranch: tree };
            tree = tree.flat( 1 );
        }
    }

/// @brief Returns the list that is in the insertion point for the length.
function
buildNearestBranch( tree, desiredLength )
    {
        for ( ;; ) {
            const b = Array_flatExclude( tree );
            // If the pased length is up to the size we have, return it. 
            // And give up if nothing was removed.   
            if ( desiredLength <= b.length || b.length === tree.length )
                return b;
            tree = tree.flat( 1 );
        }
    }

// Turn the section from start...end into an array.
function 
Array_fold( array, start, end )
    {
        
        array[start] = array.splice( start, end - start, null );
        return array;
    }

/// @brief We expect the arguments we are presented with to incude the command name 
/// and we don't count $0 as an "argument".
const OFFSET_FOR_COMMAND_NAME = 1;

/// @brief Validate we have enough positionals, fold any list parameter,
/// and return the "binding".
///
/// @remarks In general, this can be viewed as destructruing. We work out what is destructured and bound.
function 
arrangePositionals( positionalTree, rawPositionals ) {
    const onlyPositionalsGiven = rawPositionals.length - OFFSET_FOR_COMMAND_NAME ? `only ${rawPositionals.length - OFFSET_FOR_COMMAND_NAME}` : 'none';
    // Change this to "3 positional arguments" needed or "at least 3 positioanl arguments needed" and drop the count given?
    if ( rawPositionals.length < positionalTree.shortest ) 
        throw new TypeError( `Required ${ positionalTree.size > 1 ? 'at least ' : ''}${positionalTree.shortest - OFFSET_FOR_COMMAND_NAME} arguments - but ${onlyPositionalsGiven} given.`  );
    
    // These will be Usage/PositionalOption.mjs
    // These are now horrible fitted to the physical option count.
    const positionalOptions = positionalTree.getNearestTo( rawPositionals.length );
    
    if ( rawPositionals.length < positionalOptions.length ) 
        throw new TypeError( `Required ${positionalOptions.length} arguments - but only ${onlyPositionalsGiven} given`  );
    
    if ( rawPositionals.length > positionalTree.longest ) {
        //throw new TypeError( `No more than ${positionalTree.longest} arguments permitted - but ${rawPositionals.length} given`  );
        throw new TypeError( `No more than ${positionalTree.longest} positional arguments`  );
    }
    
    const listSlice = positionalTree.getListSlice( rawPositionals.length );
    let arrangePositionals; 
    if ( listSlice ) {
        arrangePositionals = rawPositionals.slice( 0 );
        Array_fold( arrangePositionals, listSlice.start, listSlice.end );
    } else {
        arrangePositionals = rawPositionals;
    }
    return {positionals:arrangePositionals,positionalOptions};
}

const INFINITY = 0x0fff_ffff; 
export default class 
PositionalTree
{
    #tree;
    #positionalOptions;          //< PositionalOption[]: all the positionals.
    #listIndex;
    #listNode;
    #hasTail = false;            //< bool: true, if the last positional is `...`; 
    #omitEmptyList;
    
    #longestBranchLength;
    get longest() { return this.#longestBranchLength }
    shortest;
    size;

    constructor( astNodeTree )
        {
            const lists = [],
                  longestBranch = [];
            let maxDepth = 0,
                shortestBranchLength = 0;
            const suffixedNameds = new Set;
            /// Q: Why are we deferring building Positional till this late. Couldn't we receive the tree with
            /// the positionals already built? 
            /// A: We don't know their index until the entire tree is created. So we would need to posthumously
            /// fix up the indexes even if we didn't do the conversion.
            const newTree = Array_mapWithStructure( astNodeTree, ( astNode, flatIndex, depth, localIndex, branch ) => {
                const positional = PositionalOption.fromAstNode( astNode, flatIndex );
                
                if ( astNode.suffix ) {
                    if ( suffixedNameds.has( positional.orgTypeName ) ) {
                        // FIXME: we want STRING1 or whatever. 
                        throw new TypeError( `duplicate ${astNode.value} suffix '${astNode.suffix}' at \$${flatIndex}` );
                    }
                    suffixedNameds.add( positional.orgTypeName );
                }
                if ( positional.recurs ) {
                    lists.push( { positional, depth, flatIndex, localIndex, min: astNode.min } ); 
                }
                if ( depth === 0 ) {
                    shortestBranchLength++;
                } else if ( depth > maxDepth ) {
                    maxDepth = depth;
                }
                // Everything except the top level case is caught by the grammar.
                // i.e. we could spot this with astNodeTree.filter( n => Array.isArray(n) ).length > 1 
                if ( branch !== 0 ) {
                    throw new Error( "Can only have one optional segment" );
                }
                console.assert( longestBranch.length === flatIndex, "invariant: flat index" )
                longestBranch.push( positional );
                return positional;
            } );
            // Is [x... x] sensible...?` Yes I guess it is.
            let longestBranchLength = longestBranch.length,
                listIndex = longestBranchLength,
                listNode = null,
                omitEmptyList = false;
            if ( lists.length ) {
                if ( lists.length !== 1 )
                    throw new TypeError( "Only one positional may be a list." );
                if ( lists[0].depth !== maxDepth )
                    throw new TypeError( "List must be maximully eldied" );
                listNode = lists[0].positional;
                listIndex = lists[0].flatIndex;
                // 2022_10_4: historically, the code couldn't handle this
                // and ast nodes were folded and the min set. We should
                // reverse this and make it proper; that would remove the hacking
                // of shortest and getNearestTo. 
                omitEmptyList = lists[0].min === 0;
                longestBranchLength = INFINITY;
                if ( omitEmptyList ) {
                    shortestBranchLength--;
                }
            }
            setOldAliases( longestBranch );
            setNewAliases( longestBranch );
            this.#tree = newTree;
            this.#positionalOptions = longestBranch;
            this.shortest = shortestBranchLength;
            this.#longestBranchLength = longestBranchLength;
            this.#listIndex = listIndex;
            this.#listNode = listNode;
            this.#omitEmptyList = omitEmptyList;
            this.size = maxDepth + 1;
            if ( !( this.#listNode !== null ? this.longest === INFINITY : this.longest !== INFINITY ) ) {
                console.log( "this", this.#listNode, this, this.#listNode !== null, this.longest !== INFINITY );
                throw new Error( "List invariant failed" );
            }
            
        }
    
    hasList()
        {
            console.assert( this.#listNode !== null ? this.longest === INFINITY : this.longest !== INFINITY, "PositionalTree: invariant: both measures of list must match" );  
            return this.#listNode !== null;
        }
    
    /// @brief 
    /// We need a better name for this!
    ///
    /// I think this return `PositionalOption[]` for whatever the maximum possible expansion
    /// (with lists folded into a single arg). It's used in creating alaises.
    getLongestBranch()
        {
            return this.#positionalOptions;
        }
    
    enumOptions() {
        return this.#positionalOptions.values();
    }

    getNearestTo( length )
        {
            const result = buildNearestBranch( this.#tree, length );
            if ( this.#omitEmptyList && result.length > length ) {
                // FIXME: we can pre compute this. But see above. The list
                // should be folded if we want this.
                const index = result.findIndex( n => n === this.#listNode );
                if ( index === -1 )
                    throw new TypeError( "List missing" );
                result.splice( index, 1 );
            }
            return result; 
        }
    
    /// @brief The idl needs to know whether there is a file list 
    /// so it can adjust the platform options to include file
    /// options.
    getList()
        {
            return this.#listNode;
        }
    
    getListSlice( length )
        {
            if ( !this.hasList() )
                return;
            const maxNonListTerms = this.#positionalOptions.length - 1;
            const listElements = maxNonListTerms < length ? length - maxNonListTerms : 0;
            // 2022_10_4: If we don't do this, a zero length empty list will be created
            // as a positional by the LexicalEnvironment. 
            if ( listElements === 0 && this.#omitEmptyList )
                return;
            return { start: this.#listIndex, end: this.#listIndex + listElements };
        }

    isEmpty() {
        return this.#longestBranchLength === 0;
    }
        

    arrange( rawPositionals ) {
        return arrangePositionals( this, rawPositionals );
    }

    *aliases() {
        for ( const {key,aliases} of this.#positionalOptions ) {
            for ( const a of aliases ) {
                yield [key,a];
            }
        }
    }
    get( findKey ) {
        return this.#positionalOptions.find( ({key}) => key === findKey );
    }
    has( findKey ) {
        return this.#positionalOptions.some( ({key}) => key === findKey );
    }

    /// @brief Add a `...` element which consumes positionals AND OPTIONS "as is"
    //// so they can be reparsed - e.g. `js-hell SCRIPTLET ...`
    addTail( ) {
        // Superfically, this appears to be a list. The reason it's not is
        // because, currently, the argtok returns the iterator as a single arg once we 
        // hit the required number of positionals. So our parser doesn't have to handle it.
        // (A mistake?) 
        if ( this.#hasTail || this.hasList() )
            throw new Error( "already has a tail" );
        if ( this.shortest !== this.longest )
            throw new TypeError( "can only set tail when there are no optionals" );
        this.shortest++;
        this.#longestBranchLength++;
        this.#hasTail = true;
        const option = new PositionalOption({index:this.shortest-1}); 
        this.#positionalOptions.push( option );
        this.#tree.push( option );
        
    }
    
    getTailStartIndex() {
        return this.#hasTail ? this.shortest - 1 : 0;
    }
};


