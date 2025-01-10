
export default function
isIterator( object )
    {
        
        if ( typeof object !== 'object' || !object )
            return false;
        // 2024_8_19: Now we have the `Iterator` global, should we do 
        // `instanceof Iterator`?
        if ( typeof object.next !== 'function' )
            return false;
        // The above likely rules out anything that provides an iterator, e.g. an array instance.
        // We could look for a tag or something. But this should clinch it.
        if ( typeof object[Symbol.iterator] !== 'function' )
            return false;
        return object[Symbol.iterator]() === object;
    }