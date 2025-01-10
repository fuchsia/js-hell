export default function
mix( constructor, iface )     
    {        
        const {prototype} = constructor;        
        for ( const name in iface ) {            
            if (  name in prototype )                
                continue;            
            prototype[name] = iface[name];        
        }
        return constructor;    
    }