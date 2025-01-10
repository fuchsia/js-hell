export const js_hell = "IDL=1 db DATABASE_FILE :: default( await $1.database( 'scores' ) )";

export default function 
main( database )
    {
        return database.prepare( "SELECT * FROM scores" ).all( )
    }