export const js_hell = `IDL=1 
-- Run the SQL query \`\` \`SELECT \${QUERY_TEXT}\` \`\` on DATABASE_FILE.
-- ${''/* Should the below be an annotation to the --input switch? */} 
-- If DATABASE_FILE isn't a table, it will be converted to database with table name 'STDIN'; for example,
-- \`js-hell select --input=file.csv '"FROM STDIN Name,sum( Amount ) AS Total GROUP BY Name ORDER BY Name"'\`
-- ${''/* OUTPUT_FORMAT=psv*/}
select [--input=DATABASE_FILE] QUERY_TEXT :: default( await input.database('STDIN'), $1 ) as JSON`;             
                                             
export default function( db, query ) {        
    return db.prepare( `SELECT ${query}` ).all();    
}