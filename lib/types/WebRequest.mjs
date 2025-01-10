import {realiseTo} from "../consts.mjs";

export default class
WebRequest {
    #url;
    [realiseTo] = 'URL';

    constructor( url )
        {
            this.#url = url;
        }

    toURL()
        {
            return this.#url;
        }
    
    // 2022_10_21: This is forced on us somewhere and there is no flying
    // monkey interception of realisation - yet.
    // 2024_4_25: This should be sync - buffers are. But it's tied up in the
    // casting mechanism which requires it to be toBuffer().
    async toBuffer()
        {
            return Buffer.from( await ( await fetch( this.#url )  ).arrayBuffer() )
        }
    /*fetchContentAsResponse()
        {
            return fetch( this.#url );
        }*/
};
