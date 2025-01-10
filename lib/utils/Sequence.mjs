import {realiseTo} from "../symbols.mjs";

const STATE_SUPERPOSITION = '', STATE_ITERATOR = 'iterator', STATE_ARRAY = 'array';

class 
SequenceIterator {
    #sequence;
    #state;
    #index = 0;
    
    constructor( sequence )
        {
            this.#sequence = sequence;
            this.#state = STATE_SUPERPOSITION;
        }

    next() {
        let state = this.#state;
        if ( state === STATE_SUPERPOSITION ) {
            const sequenceState = toSequenceState( this.#sequence );
            if ( sequenceState === STATE_SUPERPOSITION ) {
                state = STATE_ITERATOR;
                collapseToIterator( this.#sequence ); 
            } else if ( sequenceState === STATE_ARRAY ) {
                state = STATE_ARRAY;
            } else if ( sequenceState === STATE_ITERATOR ) {
                // This means we need to cache...
                // We could use WeakRef/Finalisation to count how many readers we have.
                throw new TypeError( "Multiple iterators over content" ); 
            } else {
                throw new TypeError( "Unknown #state" );
            }
            this.#state = state; 
        }
        if ( state === STATE_ARRAY ) {
            const underlyingArray = toUnderlyingArray( this.#sequence );
            if ( index < underlyingArray.length ) {
                return { value: underlyingArray[index++], done: false }
            } else {
                return { value: undefined, done: true }
            }
        } else if ( state === STATE_ITERATOR ) {
            return toUnderlyingIterator( this.#sequence ).next();
        } else {
            throw new TypeError( "Unknown state" );
        }
    }

    [Symbol.iterator]() { return this; }
    //toIterator() { console.log("realised iterator" ); return this; }
    //get [realiseTo]() { return "Iterator"; } 
};

function*
map( iterable, callback )
    {
        for ( const value of iterable ) 
            yield callback( value );
    }

export default class
Sequence
{
    #state = STATE_SUPERPOSITION;
    #iterator;
    #array;
    #realisedIteratorCount = 0;
    get [realiseTo]() { return "Array" }

    constructor( iterator )
        {
            this.#iterator = iterator;
        }

    toArray()
        {
            if ( this.#state === STATE_SUPERPOSITION ) {
                collapseToArray( this );
            } else if ( this.#state !== STATE_ARRAY ) {
                throw new TypeError( "Cannot convert to an array" );
            }
            return this.#array;
        }

    [Symbol.iterator]() { return new SequenceIterator( this ) }

    get length() { return this.toArray().length; }
    at( index ) { return this.toArray().at( index ) }
    slice( start, end ) { return this.toArray().slice( start, end ) }
    values( ) { return this[Symbol.iterator]() }
    map( callback ) 
        {
            // Q: Should we be hand it off to `Array.prototype.map` 
            // if it's an array?
            // A: No. The map operation could still be expensive in terms of
            // time or memory (e.g. taking a list of filenames and loading
            // them ). So proceed sequentially.
            //
            // NB: if we are going to hook realise, this needs to do it.  
            //
            // 2022_10_21: We have to return a sequence to ensure it's realised as an array
            // if the user does nothing. Otherwise they end up with a generator.
            return new Sequence( map( this[Symbol.iterator](), callback ) );
        }

    // These are friends that will be deleted.
    static toSequenceState( sequence ) { return sequence.#state }
    
    static toUnderlyingArray( sequence ) 
        { 
            if ( sequence.#state !== STATE_ARRAY )
                throw new TypeError( "Not an array" );
            return sequence.#array;
        }

    static toUnderlyingIterator( sequence ) 
        { 
            if ( sequence.#state !== STATE_ITERATOR )
                throw new TypeError( "Not an iterator" );
            return sequence.#iterator;
        }

    static collapseToIterator( sequence )
        {
            if ( sequence.#state !== STATE_SUPERPOSITION )
                throw new TypeError( "Not in a superposition" );
            sequence.#state = STATE_ITERATOR;
        }
    static collapseToArray( sequence )
        {
            if ( sequence.#state !== STATE_SUPERPOSITION )
                throw new TypeError( "Not in a superposition" );
            sequence.#array = Array.from( sequence.#iterator );
            sequence.#iterator = null;
            sequence.#state = STATE_ARRAY;
        }
};

// Friend functions.
const {toSequenceState,collapseToArray,collapseToIterator,toUnderlyingIterator,toUnderlyingArray}=Sequence;
delete Sequence.toSequenceState;
delete Sequence.collapseToIterator;
delete Sequence.collapseToArray;
delete Sequence.toUnderlyingIterator;
delete Sequence.toUnderlyingArray; 