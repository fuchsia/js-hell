
export default class 
CounterMap {
    #entries = new Map;

    get size() {
        return this.#entries.size;
    }
    has( key ) {
        return this.#entries.has( key );
    }

    get( key ) {
        if ( !this.#entries.has( key ) )
            return 0;
        return this.#entries.get( key );
    }

    add( key ) {
        this.#entries.set( key, this.get( key ) + 1 );
    }
    delete( key ) {
        const count = this.get( key );
        if ( count > 1 ) {
            this.#entries.set( key, count - 1 ); 
        } else {
            this.#entries.delete( key );
        }
    }
        
    entries( ) {
        return this.#entries.entries();
    }
    keys() {
        return this.#entries.keys();
    }
};