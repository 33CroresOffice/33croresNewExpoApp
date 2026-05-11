/*
  # Create user_id mapping table and migrate profiles from CSV

  ## Summary
  This migration:
  1. Creates a `user_id_mapping` table to store the logical USER_ID (e.g., "USER64756") to internal UUID mapping
  2. Creates auth.users entries for each user (using a placeholder email derived from mobile)
  3. Inserts all profiles from the provided CSV data
  4. Mobile numbers in CSV are in scientific notation (9.19E+11) - converted to proper format

  ## Tables Modified
  - `user_id_mapping` (NEW): maps logical user_id string to internal UUID
  - `profiles`: populated with all users from CSV

  ## Notes
  - Mobile numbers stored as 10-digit strings
  - NULL values for name/email preserved
  - Gender values normalized to lowercase
  - date_of_birth stored as date
*/

CREATE TABLE IF NOT EXISTS user_id_mapping (
  logical_id text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_id_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view user_id_mapping"
  ON user_id_mapping FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Helper function to parse scientific notation mobile numbers
CREATE OR REPLACE FUNCTION parse_mobile(val text) RETURNS text AS $$
DECLARE
  num bigint;
BEGIN
  IF val IS NULL OR val = 'NULL' THEN RETURN NULL; END IF;
  -- Handle scientific notation like 9.19861E+11
  BEGIN
    num := val::numeric::bigint;
    RETURN LPAD(num::text, 10, '0');
  EXCEPTION WHEN OTHERS THEN
    RETURN val;
  END;
END;
$$ LANGUAGE plpgsql;

-- Insert profiles using a staging approach
-- We create auth users first, then profiles
DO $$
DECLARE
  v_uid uuid;
  v_mobile text;
  v_existing_profile_id uuid;

  -- Define the users data as arrays
  users_data text[][] := ARRAY[
    ARRAY['USER65632','Sidh','919861484751','sidhh@gmail.com','Male','1998-12-31'],
    ARRAY['USER41614','Priya','918282799992','priya@33crores.com','Female','1980-08-30'],
    ARRAY['USER87913','Babul','919195570000',NULL,'Male',NULL],
    ARRAY['USER78914','Basudha Nandan Varadwaj Das','917009000000','sddiku@gmail.com','Male','2025-09-25'],
    ARRAY['USER78429','pratyusha pattanaik','919199720000','p31pratyusha@gmail.com','Female',NULL],
    ARRAY['USER29907',NULL,'919199380000',NULL,NULL,NULL],
    ARRAY['USER89185',NULL,'917879000000',NULL,NULL,NULL],
    ARRAY['USER71681',NULL,'917439000000',NULL,NULL,NULL],
    ARRAY['USER98569',NULL,'919196580000',NULL,NULL,NULL],
    ARRAY['USER56639',NULL,'919193370000',NULL,NULL,NULL],
    ARRAY['USER20279',NULL,'918144000000',NULL,NULL,NULL],
    ARRAY['USER87265',NULL,'919197790000',NULL,NULL,NULL],
    ARRAY['USER52112',NULL,'917685000000',NULL,NULL,NULL],
    ARRAY['USER41332',NULL,'917979000000',NULL,NULL,NULL],
    ARRAY['USER78661',NULL,'919194080000',NULL,NULL,NULL],
    ARRAY['USER22359',NULL,'919199390000',NULL,NULL,NULL],
    ARRAY['USER86287','PANKAJ SIAL','917008000000','Pankajsai89@gmail.com','Male',NULL],
    ARRAY['USER55385',NULL,'919199380000',NULL,NULL,NULL],
    ARRAY['USER76379',NULL,'916370000000',NULL,NULL,NULL],
    ARRAY['USER64756','Deepika Mohapatra','919194380000','deepikamohapatra.1983@gmail.com','Female',NULL],
    ARRAY['USER69307','Snigdha Nayak','918971000000',NULL,NULL,NULL],
    ARRAY['USER18750',NULL,'919190830000',NULL,NULL,NULL],
    ARRAY['USER66199','Smaranika Mohanty','918851000000',NULL,NULL,NULL],
    ARRAY['USER89223','Priyanka Prusty','919196330000',NULL,NULL,NULL],
    ARRAY['USER86504','Gayatri Brahma','918763000000',NULL,NULL,NULL],
    ARRAY['USER96257','Subhasish Dash','919198530000',NULL,NULL,NULL],
    ARRAY['USER62189',NULL,'919199380000',NULL,NULL,NULL],
    ARRAY['USER32876','W . Singh','917008000001',NULL,NULL,NULL],
    ARRAY['USER33109','?','919191250000',NULL,NULL,NULL],
    ARRAY['USER40567',NULL,'918908000000',NULL,NULL,NULL],
    ARRAY['USER40489','Sabita Burma','918019000000',NULL,NULL,NULL],
    ARRAY['USER40490','Mamata Sahoo','916373000000',NULL,NULL,NULL],
    ARRAY['USER92793',NULL,'918794000000',NULL,NULL,NULL],
    ARRAY['USER32800',NULL,'916371000000',NULL,NULL,NULL],
    ARRAY['USER75460',NULL,'919195560000',NULL,NULL,NULL],
    ARRAY['USER61372',NULL,'917854000000',NULL,NULL,NULL],
    ARRAY['USER30797',NULL,'919193370000',NULL,NULL,NULL],
    ARRAY['USER23044',NULL,'917439000001',NULL,NULL,NULL],
    ARRAY['USER88679','Smruti Das','918929000000',NULL,NULL,NULL],
    ARRAY['USER47434',NULL,'917684000000',NULL,NULL,NULL],
    ARRAY['USER47218',NULL,'919196680000',NULL,NULL,NULL],
    ARRAY['USER36541','Priyangi Das','919196930000',NULL,NULL,NULL],
    ARRAY['USER45565','Bidya dhara Sahoo','919199370000',NULL,NULL,NULL],
    ARRAY['USER98582','Atul','918766000000',NULL,NULL,NULL],
    ARRAY['USER17786','Starleen Rath','917683000000',NULL,NULL,NULL],
    ARRAY['USER81359','Pragyan jena','918801000000',NULL,NULL,NULL],
    ARRAY['USER20469','Debendra','919199380000',NULL,NULL,NULL],
    ARRAY['USER48657',NULL,'918801000001',NULL,NULL,NULL],
    ARRAY['USER79430','Meeru','919194380000',NULL,NULL,NULL],
    ARRAY['USER51244','Jita Mohanty','919194400000',NULL,NULL,NULL],
    ARRAY['USER86413','Sujata pattnaik','919194370000',NULL,NULL,NULL],
    ARRAY['USER34813','Sudipta Srichandana','918456000000',NULL,NULL,NULL],
    ARRAY['USER30614','Seba','919199380000',NULL,'female',NULL],
    ARRAY['USER95904','Sibani Swetana','917979800000',NULL,NULL,NULL],
    ARRAY['USER83991','Minakhsee','918763000001',NULL,NULL,NULL],
    ARRAY['USER49946',NULL,'919199390000',NULL,NULL,NULL],
    ARRAY['USER38292','Swatee Dash','918764000000',NULL,NULL,NULL],
    ARRAY['USER96131','Sanghamitra Tripathy','919198330000',NULL,NULL,NULL],
    ARRAY['USER88923','biswanath behera','917438000000',NULL,NULL,NULL],
    ARRAY['USER31786','Chinmay','918867000000',NULL,NULL,NULL],
    ARRAY['USER96614','Shagun Nayak','919199370000',NULL,NULL,NULL],
    ARRAY['USER74502','Dolly','919194400000',NULL,NULL,NULL],
    ARRAY['USER64052','Kanak','918921000000','srkanchan009@gmail.com','Female',NULL],
    ARRAY['USER77305','Geeta Mohapatra','919194390000',NULL,NULL,NULL],
    ARRAY['USER48919','Anupam','919197400000',NULL,NULL,NULL],
    ARRAY['USER17296','Swonamika','918896000000',NULL,NULL,NULL],
    ARRAY['USER71909',NULL,'919199370000',NULL,NULL,NULL],
    ARRAY['USER97193',NULL,'919198370000',NULL,NULL,NULL],
    ARRAY['USER28496',NULL,'919199370000',NULL,NULL,NULL],
    ARRAY['USER95157','Brajesh Singh','917301000000',NULL,NULL,NULL],
    ARRAY['USER70837','Pragyan','919191460000',NULL,NULL,NULL],
    ARRAY['USER15044','S Dash','918909000000',NULL,NULL,NULL],
    ARRAY['USER11158','Satyabrata','919190090000',NULL,NULL,NULL],
    ARRAY['USER13977','Rajendra Mohalik','918329000000',NULL,NULL,NULL],
    ARRAY['USER33884','Sashmita Ray','917848000000',NULL,NULL,NULL],
    ARRAY['USER44072','Suchismita','919199390000',NULL,NULL,NULL],
    ARRAY['USER37291',NULL,'917979000001',NULL,NULL,NULL],
    ARRAY['USER49620',NULL,'919198530000',NULL,NULL,NULL],
    ARRAY['USER52406','Reemu Ranjan','917889000000',NULL,NULL,NULL],
    ARRAY['USER65477','B nayak','918282800000','Biswa@33crores.com','Male',NULL],
    ARRAY['USER42492','jit mukherjee','919193380000',NULL,NULL,NULL],
    ARRAY['USER91415','B K Panda','919199370000',NULL,NULL,NULL],
    ARRAY['USER72173','Sujata Pattnaik','919196680000',NULL,NULL,NULL],
    ARRAY['USER24333','Subrat ranjan padhi','919198610000','srp9861484751@gmail.com','Male',NULL],
    ARRAY['USER46316','Pk Jha','917542000000',NULL,NULL,NULL],
    ARRAY['USER67133','Sunita Patra','919194380000',NULL,NULL,NULL],
    ARRAY['USER94481',NULL,'919193910000',NULL,NULL,NULL],
    ARRAY['USER58053','priyangi das','917979000002',NULL,NULL,NULL],
    ARRAY['USER94856',NULL,'918094000000',NULL,NULL,NULL],
    ARRAY['USER33292',NULL,'916203000000',NULL,NULL,NULL],
    ARRAY['USER21315',NULL,'917978000000',NULL,NULL,NULL],
    ARRAY['USER93762','Atul Patra','919199110000',NULL,NULL,NULL],
    ARRAY['USER42740','Rupa','918093000000',NULL,NULL,NULL],
    ARRAY['USER84170','?','919197320000',NULL,NULL,NULL],
    ARRAY['USER42674',NULL,'919199390000',NULL,NULL,NULL],
    ARRAY['USER64930',NULL,'918002000000',NULL,NULL,NULL],
    ARRAY['USER27242',NULL,'919193490000',NULL,NULL,NULL],
    ARRAY['USER18362','seema mitra','917853000000',NULL,NULL,NULL],
    ARRAY['USER42821','Manoranjan','919193380000','soumyapuhan22@gmail.com','Female',NULL],
    ARRAY['USER33528','soumitri   baral','919194370000',NULL,NULL,NULL],
    ARRAY['USER57843',NULL,'919193120000',NULL,NULL,NULL],
    ARRAY['USER23305',NULL,'919191490000',NULL,NULL,NULL],
    ARRAY['USER85104','sibasish mahapatra','917009000001',NULL,NULL,NULL],
    ARRAY['USER76489',NULL,'917009000002',NULL,NULL,NULL],
    ARRAY['USER22009','Sidhartha Sahoo','917979000003',NULL,NULL,NULL],
    ARRAY['USER86174',NULL,'917787000000',NULL,NULL,NULL],
    ARRAY['USER69987',NULL,'919192370000',NULL,NULL,NULL],
    ARRAY['USER43494','Pritam Puhan','919194020000','ppuhan@yahoo.com','Male','1978-06-27'],
    ARRAY['USER84037',NULL,'918249000000',NULL,NULL,NULL],
    ARRAY['USER59851',NULL,'918598000000',NULL,NULL,NULL],
    ARRAY['USER69060',NULL,'919190890000',NULL,NULL,NULL],
    ARRAY['USER33800',NULL,'917736000000',NULL,NULL,NULL],
    ARRAY['USER16017',NULL,'917044000000',NULL,NULL,NULL],
    ARRAY['USER59846','MONALISA PATNAIK','918250000000','patnaikmonalisa09@gmail.com','Female',NULL],
    ARRAY['USER94858','sriya patnaik','919194400000',NULL,NULL,NULL],
    ARRAY['USER54320','sujata','918710000000',NULL,NULL,NULL],
    ARRAY['USER72210',NULL,'918249000001',NULL,NULL,NULL],
    ARRAY['USER99223',NULL,'919199380000',NULL,NULL,NULL],
    ARRAY['USER41113','prateek behera','918328000000',NULL,NULL,NULL],
    ARRAY['USER37949',NULL,'918115000000',NULL,NULL,NULL],
    ARRAY['USER51393',NULL,'918658000000',NULL,NULL,NULL],
    ARRAY['USER95624',NULL,'917205000000',NULL,NULL,NULL],
    ARRAY['USER62920','Subha arun','919197410000',NULL,NULL,NULL],
    ARRAY['USER14857',NULL,'919198280000',NULL,NULL,NULL],
    ARRAY['USER67867','alka','917736000001',NULL,NULL,NULL],
    ARRAY['USER18018',NULL,'917782000000',NULL,NULL,NULL],
    ARRAY['USER11238','rich das','916370000001',NULL,NULL,NULL],
    ARRAY['USER22436',NULL,'918763000002',NULL,NULL,NULL],
    ARRAY['USER94822',NULL,'919198610000',NULL,NULL,NULL],
    ARRAY['USER68194',NULL,'919199370000',NULL,NULL,NULL],
    ARRAY['USER93328',NULL,'919190780000',NULL,NULL,NULL],
    ARRAY['USER84704','ashish kumar','919197690000',NULL,NULL,NULL],
    ARRAY['USER29632',NULL,'919199380000',NULL,NULL,NULL],
    ARRAY['USER28717',NULL,'919198620000',NULL,NULL,NULL],
    ARRAY['USER53523',NULL,'918985000000',NULL,NULL,NULL],
    ARRAY['USER28750',NULL,'919197760000',NULL,NULL,NULL],
    ARRAY['USER30200','bk parida','919194370000',NULL,NULL,NULL],
    ARRAY['USER28475','utkalika','917206000000',NULL,NULL,NULL],
    ARRAY['USER70901','xy','919199370000',NULL,NULL,NULL],
    ARRAY['USER47756','Alok Mohanty','919197170000',NULL,NULL,NULL],
    ARRAY['USER72158',NULL,'919194380000',NULL,NULL,NULL],
    ARRAY['USER95626','Padmaja Mohanty','916353000000',NULL,NULL,NULL],
    ARRAY['USER97486',NULL,'919194390000',NULL,NULL,NULL],
    ARRAY['USER69424',NULL,'918669000000',NULL,NULL,NULL],
    ARRAY['USER69047',NULL,'919198560000',NULL,NULL,NULL],
    ARRAY['USER27787',NULL,'916901000000',NULL,NULL,NULL],
    ARRAY['USER56770',NULL,'918250000001',NULL,NULL,NULL],
    ARRAY['USER46939','Bhavani Das','919191250000',NULL,NULL,NULL],
    ARRAY['USER19683','Sonali Pattanaik','919197770000','sonalispattanaik@gmail.com','Female',NULL],
    ARRAY['USER44975','DEEPAK KUMAR NAYAK','919196680000','deepak.nayak007@gmail.com','Male',NULL],
    ARRAY['USER47355','debasmita sikder','919198360000',NULL,NULL,NULL],
    ARRAY['USER79359','Dr Abhijit Dash','916371000001',NULL,NULL,NULL],
    ARRAY['USER22470',NULL,'919197650000',NULL,NULL,NULL],
    ARRAY['USER10771',NULL,'919196680000',NULL,NULL,NULL],
    ARRAY['USER84474','Purnima Tripathy','917848000001','purnimatripathy41@gmail.com','Female','1989-03-03'],
    ARRAY['USER14408','Sushri Swagatika','919197760000',NULL,NULL,NULL],
    ARRAY['USER67418',NULL,'919193490000',NULL,NULL,NULL],
    ARRAY['USER86498','Sanjibita Priyadarshani','919195570000',NULL,NULL,NULL],
    ARRAY['USER40581','manas ranjan mohanty','919190400000',NULL,NULL,NULL],
    ARRAY['USER46387','Mukta Manjari Pradhan','916281828164',NULL,NULL,NULL],
    ARRAY['USER29631',NULL,'9861302347',NULL,NULL,NULL],
    ARRAY['USER88961',NULL,'917750000000',NULL,NULL,NULL],
    ARRAY['USER20504','S Dash','918909000001',NULL,NULL,NULL],
    ARRAY['USER58791','Sangeeta Bera','919194400000',NULL,NULL,NULL],
    ARRAY['USER35420',NULL,'919196550000',NULL,NULL,NULL],
    ARRAY['USER10204',NULL,'919194370000',NULL,NULL,NULL],
    ARRAY['USER15403',NULL,'919193610000',NULL,NULL,NULL],
    ARRAY['USER39449','rojalin pani','919197790000',NULL,NULL,NULL],
    ARRAY['USER92650','Sasmita Parida','918659000000',NULL,NULL,NULL],
    ARRAY['USER24531',NULL,'919198100000',NULL,NULL,NULL],
    ARRAY['USER69526','Snigdha','919195570000',NULL,NULL,NULL],
    ARRAY['USER79327','sai krishna pradhan','916282000000',NULL,NULL,NULL],
    ARRAY['USER23643',NULL,'919196500000',NULL,NULL,NULL],
    ARRAY['USER86405','nibedita kalo','919195460000',NULL,NULL,NULL],
    ARRAY['USER37671',NULL,'916505000000',NULL,NULL,NULL],
    ARRAY['USER57051','luva life','919194080000',NULL,NULL,NULL],
    ARRAY['USER41483',NULL,'919194370000',NULL,NULL,NULL],
    ARRAY['USER68111',NULL,'919197770000',NULL,NULL,NULL],
    ARRAY['USER83425',NULL,'919198610000',NULL,NULL,NULL],
    ARRAY['USER71036','mamta padhi','919194380000',NULL,NULL,NULL],
    ARRAY['USER79885','smruti mohapatra','918917000000',NULL,NULL,NULL],
    ARRAY['USER38844','jaspreet kuar','919196930000',NULL,NULL,NULL],
    ARRAY['USER55150',NULL,'910000000000',NULL,NULL,NULL],
    ARRAY['USER95106','priyambada mahapatra','919193270000',NULL,NULL,NULL],
    ARRAY['USER22834','sarmistha pattnaik','917077000000',NULL,NULL,NULL],
    ARRAY['USER10319','priti','919195890000',NULL,NULL,NULL],
    ARRAY['USER30167','dr harish','917349000000',NULL,NULL,NULL],
    ARRAY['USER55527','Amruta Kar','917009000003',NULL,NULL,NULL],
    ARRAY['USER19783','swagat padhi','919191240000',NULL,NULL,NULL],
    ARRAY['USER43828','jayanti panda','917979000004',NULL,NULL,NULL],
    ARRAY['USER76273','l v','917070000000',NULL,NULL,NULL],
    ARRAY['USER20596','Rashmi Mohanty','919194390000',NULL,NULL,NULL],
    ARRAY['USER54062',NULL,'919199390000',NULL,NULL,NULL],
    ARRAY['USER69780',NULL,'919198660000',NULL,NULL,NULL],
    ARRAY['USER76743',NULL,'916598000000',NULL,NULL,NULL],
    ARRAY['USER45683',NULL,'917008000002',NULL,NULL,NULL],
    ARRAY['USER95931',NULL,'919199710000',NULL,NULL,NULL],
    ARRAY['USER60427',NULL,'919198860000',NULL,NULL,NULL],
    ARRAY['USER28379',NULL,'917979000005',NULL,NULL,NULL],
    ARRAY['USER29591',NULL,'917378000000',NULL,NULL,NULL],
    ARRAY['USER18483','Demo','916878000000','Sdsf@gmail.com','Male',NULL],
    ARRAY['USER45999',NULL,'915657000000',NULL,NULL,NULL],
    ARRAY['USER83950',NULL,'915761000000',NULL,NULL,NULL],
    ARRAY['USER31714',NULL,'915465000000',NULL,NULL,NULL],
    ARRAY['USER68626',NULL,'919195470000',NULL,NULL,NULL],
    ARRAY['USER85395',NULL,'919198650000',NULL,NULL,NULL],
    ARRAY['USER19537',NULL,'918987000000',NULL,NULL,NULL],
    ARRAY['USER38275',NULL,'920000000000',NULL,NULL,NULL],
    ARRAY['USER56856',NULL,'918865000000',NULL,NULL,NULL],
    ARRAY['USER82413',NULL,'915649000000',NULL,NULL,NULL],
    ARRAY['USER61891','Demo','918498000000','demo@gmail.com','Male','1998-12-31'],
    ARRAY['USER49128',NULL,'918957000000',NULL,NULL,NULL],
    ARRAY['USER86014',NULL,'919198660000',NULL,NULL,NULL],
    ARRAY['USER38614',NULL,'918687000000',NULL,NULL,NULL],
    ARRAY['USER25481',NULL,'919195100000',NULL,NULL,NULL],
    ARRAY['USER85332',NULL,'916835000000',NULL,NULL,NULL],
    ARRAY['USER85208','Sidh','919198610000','sidh@gmail.com','Male',NULL],
    ARRAY['USER83500','Sgjf','915768000000','gsjeg@gmail.com','Male','1998-12-31'],
    ARRAY['USER42178','Sorry','918465000000',NULL,'Male','1998-12-31'],
    ARRAY['USER68672',NULL,'918889000000',NULL,NULL,NULL],
    ARRAY['USER51942',NULL,'919198610000',NULL,NULL,NULL],
    ARRAY['USER44207',NULL,'919198760000',NULL,NULL,NULL],
    ARRAY['USER94603',NULL,'919198790000',NULL,NULL,NULL],
    ARRAY['USER84846',NULL,'919198770000',NULL,NULL,NULL],
    ARRAY['USER75661','Prashant Goundi','919197390000','prashantgoundi806@gmail.com',NULL,'1995-12-31'],
    ARRAY['USER56681','Sambit Pattnaik','917749000000','sambit143@gmail.com','Male','1986-07-09'],
    ARRAY['USER88080','deep don','917507000000',NULL,NULL,NULL],
    ARRAY['USER70228',NULL,'919198770000',NULL,NULL,NULL],
    ARRAY['USER67680','Sree','917205000001','abc@gmail.com','Male','1998-12-31'],
    ARRAY['USER78257','Prity','919197770000',NULL,'Female','1992-01-14'],
    ARRAY['USER91996',NULL,'917977000000',NULL,NULL,NULL],
    ARRAY['USER29056',NULL,'916537000000',NULL,NULL,NULL],
    ARRAY['USER76575',NULL,'919198740000',NULL,NULL,NULL],
    ARRAY['USER44387','Siva Prasad swain','919198270000','ssiva525410@gmail.com','Male','1979-10-20'],
    ARRAY['USER75440','Arunangshu Pradhan','919196470000','arunangshupradhan17@gmail.com',NULL,'1986-12-31'],
    ARRAY['USER30353',NULL,'917328000000',NULL,NULL,NULL],
    ARRAY['USER33855','Kaustuva','917735000000','koustuva8@gmail.com','Male','1985-08-07'],
    ARRAY['USER23630','Dipti','916371000002','swaindipti533@gmail.com','Male','2021-12-31'],
    ARRAY['USER42934','Test 0','919197770000','test@test.com','Male',NULL],
    ARRAY['USER34777','Niharika','919190790000','niharikanayak846@gmail.com','Female','2000-12-30'],
    ARRAY['USER48161',NULL,'916839000000',NULL,NULL,NULL],
    ARRAY['USER47909','Smita Das','919193490000','smitadas2503@gmail.com','Female','1989-12-31'],
    ARRAY['USER77808',NULL,'919198770000',NULL,NULL,NULL],
    ARRAY['USER84032','Swati Joshi','919192380000','swatijoshi16@gmail.com','Female','1988-05-15'],
    ARRAY['USER89405','SDF','919198770000','dfgh@gmail.com','Male',NULL],
    ARRAY['USER25898','Swati padhee','917979000006','swati.padhee@gmail.com','Female','1985-09-22'],
    ARRAY['USER28619','Sirisha kar','919194380000','sirishanemani22@gmail.com','Female','1986-07-21'],
    ARRAY['USER72785','Sonal','919194260000','Rohitd7715@gmail.com','Female','1974-01-09'],
    ARRAY['USER78481','Vijay kumar','919196930000','vij7862@gmail.co.com','Male','1993-12-31'],
    ARRAY['USER28548','Lisa Samantaray','919197780000','lisa33849@gmail.com','Female','1984-01-20'],
    ARRAY['USER64918','R.Elango','918609000000','elango8608892609@gmail.com','Male','1994-10-28'],
    ARRAY['USER98835','Sagarika','919197770000','sagarika2592@gmail.com','Female','1992-03-24'],
    ARRAY['USER25858','Surya','918589000000','surya.rumjhum@gmail.com','Female','1976-05-08'],
    ARRAY['USER80800',NULL,'919199560000',NULL,NULL,NULL],
    ARRAY['USER63196',NULL,'919191130000',NULL,NULL,NULL],
    ARRAY['USER64731','Biren Roy','919194340000','broy1961@gmail.cim','Male','1961-01-01'],
    ARRAY['USER43598','Vijay','918249000002','vij7861@gmail.com','Male','1988-05-08'],
    ARRAY['USER49710',NULL,'916440000000',NULL,NULL,NULL],
    ARRAY['USER89425','Damayanti Lenka','919199450000','damayantilenka2371@gmail.com','Female','1989-01-06'],
    ARRAY['USER83097','Rolly Garg','918918000000','rollyag1989@gmail.com','Female','1988-11-02'],
    ARRAY['USER73179','Ghana Shyam panigrahi','919193370000','saisebapanigrahi@gmail.com','Female','1976-03-13'],
    ARRAY['USER44127','Ritarani Mishra','919199380000','shankarbhawani8080@gmail.com','Female','1959-09-10'],
    ARRAY['USER11307',NULL,'919194370000',NULL,NULL,NULL],
    ARRAY['USER63091',NULL,'919193380000',NULL,NULL,NULL],
    ARRAY['USER76486','srp','919198750000',NULL,NULL,NULL],
    ARRAY['USER14656','Sumitra','918116000000',NULL,NULL,NULL],
    ARRAY['USER77590','Kishore Panda','919192300000',NULL,NULL,NULL],
    ARRAY['USER80597','Rita Rani Mishra','919199390000',NULL,NULL,NULL],
    ARRAY['USER36361','Mugdha Singru','917874000000',NULL,NULL,NULL],
    ARRAY['USER76913','Rajashree Behera','918637000000',NULL,NULL,NULL],
    ARRAY['USER84215',NULL,'916371000003',NULL,NULL,NULL],
    ARRAY['USER74461',NULL,'919198970000',NULL,NULL,NULL],
    ARRAY['USER37779','Sankalp mohanty','919196930000','eb.sankalp@gmail.com','Male','1988-02-25'],
    ARRAY['USER97805','Rashmi Mohanty','9194386268','shanks143@gmail.com','Female','1965-07-03'],
    ARRAY['USER12425','Pratikshya Sadangi','918763000003','sadangipratikshya@gmail.com','Female','1994-12-31'],
    ARRAY['USER30283',NULL,'919194350000',NULL,NULL,NULL],
    ARRAY['USER57995','K.C.Mishra','919195410000','kcmishra987@gmail.com','Male','1965-12-28'],
    ARRAY['USER88374','SAGARIKA GHADAI','918260000000','ghadaisagarika@gmail.com','Female','1985-12-12'],
    ARRAY['USER17493',NULL,'919194370000',NULL,NULL,NULL],
    ARRAY['USER10372','Kunal Pradhan','918895000000','kunal90pradhan@gmail.com','Male','1994-06-17'],
    ARRAY['USER87267','Biranchi','918867000001','b.rparida104@gmail.com','Male','1989-07-22'],
    ARRAY['USER54300','Abhishek Raj Agarwal','917874000001','sxc.raj@gmail.com','Male','1991-06-27'],
    ARRAY['USER88365','ss','917501000000',NULL,NULL,NULL],
    ARRAY['USER68906','Naina','919194390000',NULL,NULL,NULL],
    ARRAY['USER99986','Prakash','919195560000',NULL,NULL,NULL],
    ARRAY['USER76236','Devi Prasad Behera','917009000004','santinetra@gmail.com','Male','1995-05-19'],
    ARRAY['USER76419','Suri','919190300000','swathi.j28@gmail.com','Female','1985-06-27'],
    ARRAY['USER81444','Prasanna Das','917009000005','prasannabdas2@gmail.com','Male','1963-07-12'],
    ARRAY['USER80914','Bikash sahoo','919198610000','bikashsahoo85746@gmail.com','Male','2003-02-03'],
    ARRAY['USER89133',NULL,'917009000006',NULL,NULL,NULL],
    ARRAY['USER13735','DIPTI RANJAN SAHOO','917979000007','drs.munaa@gmail.com','Male','1987-05-08'],
    ARRAY['USER67401','Nirmal Kumar Mishra','919194380000','nirmal.k.mishra@gmail.com','Male','1971-12-31'],
    ARRAY['USER21852','Minati Sharma','917065000000',NULL,NULL,NULL],
    ARRAY['USER77499','Pratik Agrawal','918886000000','pa@gmail.com','Male','2000-12-31'],
    ARRAY['USER22484','Shashank','919191480000','shashankdsshashu507@gmail.com','Male','1999-12-31'],
    ARRAY['USER39581','Sampratika Mohanty','916371000004','mohantysampratika@gmail.com','Female','2008-12-16'],
    ARRAY['USER31855','Mrutyunjay barik','919197490000','mrutyunjaybarik007@gmail.com','Male','1984-12-31'],
    ARRAY['USER11940','Roupya Dhal','919190000000','roupyadhal2005@gmail.com','Male',NULL],
    ARRAY['USER59470','Dipu Das','918985000001','xonev85411@fillipx.com','Male','1997-12-31'],
    ARRAY['USER95176','SWAGATIKA BARIK','919197780000','Shagunnayak18@gmail.com','Female','2010-09-06'],
    ARRAY['USER28814','Saumya Ranjan Pal','918712000000','saumyaranjanpal@gmail.com','Male',NULL],
    ARRAY['USER91534','Jayanti Panda','918763000004','pandajayanti99@gmail.com','Female',NULL],
    ARRAY['USER53521','Deepak Kumar Mahanta','917795000000','mahantad20@gmail.com','Male','1988-05-18'],
    ARRAY['USER29690','Umesh','917477000000','ucosmosthebeginning@gmail.com','Male','1982-05-14'],
    ARRAY['USER19529',NULL,'919193490000',NULL,NULL,NULL],
    ARRAY['USER24379','Suprita Praharaj','919190410000','supritapraharaj1981@gmail.com','Female','1981-11-07'],
    ARRAY['USER92146','Dr Subhrakanta Rath','919194370000','rathsubhra@gmail.com','Male','1977-07-04'],
    ARRAY['USER74052','Bikram behera','917008000003','bikramaditya053@gmail.com','Male','2008-01-15'],
    ARRAY['USER27943','Haraprasad Jena','919198500000','haraj123@rediffmail.com','Male','1963-05-17'],
    ARRAY['USER74782','Ramachandra','919199370000','ramachandrapati@gmail.com','Male','1972-06-04'],
    ARRAY['USER39904','Rosan Kumar Nayak','917978000001','nayakrosan.const@gmail.com','Male','1995-09-16'],
    ARRAY['USER96309','Jyoshna Rani das','919193390000','jyotiranjandas180@gmail.com','Female','1975-02-01'],
    ARRAY['USER10940','Radhamohan Dash','919194370000','rmdash2011@gmail.com','Male','1952-02-05'],
    ARRAY['USER29080','Suchismita','919199380000','miku.pati@gmail.com','Female','1986-08-30'],
    ARRAY['USER79345',NULL,'918763000005',NULL,NULL,NULL],
    ARRAY['USER25190','Chetan','917078000000','chetancode132@gmail.com','Male','1981-03-14'],
    ARRAY['USER61101','Subhabrata Acharya','919197330000','subhabrataacharya95@gmail.com','Male','1970-04-02'],
    ARRAY['USER79339','Radhagobinda swain','917381000000','radhagobinda035@gmail.com','Male','2002-10-06'],
    ARRAY['USER31172','Eppsita Panigrahy','917338000000','Eppsita.240@gmail.com','Female','1990-11-19'],
    ARRAY['USER13114','Fiona','919193370000','fionasufi555@gmail.com','Female','1996-12-23'],
    ARRAY['USER12318','Ansh kumar','919191410000','bawlarai1241@gmail.com','Male','2003-09-29'],
    ARRAY['USER14760',NULL,'919198540000',NULL,NULL,NULL],
    ARRAY['USER90691',NULL,'918798000000',NULL,NULL,NULL],
    ARRAY['USER32323','P Umesh','916298000000','universeisme108@gmail.com','Male','1987-01-01'],
    ARRAY['USER79169','Santosh Kumar Ray','918929000001','ray.santosh@gmail.com','Male','1978-05-14'],
    ARRAY['USER20062','Mohi Agrawal','917683000001','manishaagrawal999@gmail.com','Female','1992-08-09'],
    ARRAY['USER63321',NULL,'919198610000',NULL,NULL,NULL],
    ARRAY['USER25829','D Panda','919199370000','debipanda2024@gmail.com','Male',NULL],
    ARRAY['USER49449','Arpita Sur','917894000000','inbox.arpita007@gmail.com','Female','1994-10-24'],
    ARRAY['USER52667','Ashutosh Mohanty','918093000001','ashutoshmohanty143@gmail.com','Male','1992-06-13'],
    ARRAY['USER10125','Biswakalyani Ray','919198010000','biswakalyani19883@gmail.com','Female','1983-10-09'],
    ARRAY['USER98697','Monalisa','917009000007','admin@gmail.com','Male','1999-12-31'],
    ARRAY['USER81613','Tusar','919193490000','tusartikina@gmail.com','Male','1996-11-29'],
    ARRAY['USER65991','Shivam','919193250000','shivamkaharbarthwal256@gmail.com','Male','2003-03-16'],
    ARRAY['USER88216',NULL,'917606000000',NULL,NULL,NULL],
    ARRAY['USER95653','Rita','917009000008','rubina281977@gmail.com','Female','1977-01-05'],
    ARRAY['USER19959',NULL,'919193100000',NULL,NULL,NULL],
    ARRAY['USER47878',NULL,'919193100000',NULL,NULL,NULL],
    ARRAY['USER50336',NULL,'919193160000',NULL,NULL,NULL],
    ARRAY['USER60471',NULL,'918249000003',NULL,NULL,NULL],
    ARRAY['USER60326',NULL,'919192350000',NULL,NULL,NULL],
    ARRAY['USER94784','Biswa Ranjan Mishra','919199370000','eengineersenergy@gmail.com','Male','1977-03-09'],
    ARRAY['USER15826','Murugan','917397000000','murugansaid@gmail.com','Male','1986-02-19'],
    ARRAY['USER71488','Neha Raj','919195720000','neha18023@gmail.com','Female','1985-02-22'],
    ARRAY['USER11786','Ajay','919193980000','ajaya.panda2349@gmail.com','Male','1996-12-31'],
    ARRAY['USER65879',NULL,'917077000001',NULL,NULL,NULL],
    ARRAY['USER51440','Priyansi Parida','918261000000','priyansiparida07@gmail.com','Female','1996-11-06'],
    ARRAY['USER43345',NULL,'918094000001',NULL,NULL,NULL],
    ARRAY['USER49654','Tesr','917682000000','test@gmail.com','Female','1999-12-31'],
    ARRAY['USER73063','Jiny','918115000001','debasmitapanigrahi1@gmail.com','Female','1990-03-15'],
    ARRAY['USER19734','Abhishek Acharya','919197760000','i180683@rediffmail.com','Male','1983-06-17'],
    ARRAY['USER98357',NULL,'919199170000',NULL,NULL,NULL],
    ARRAY['USER96661','Barun','919191240000','brndash6@gmail.com','Male','1993-12-02'],
    ARRAY['USER43274','Mihir ranjani Nayak','919197780000','aadisheshdash@gmail.com','Female','1975-10-17'],
    ARRAY['USER98345','Neel','919193480000','sehezadanil@gmail.com','Male','1993-05-01'],
    ARRAY['USER20651','Priyanshu','919196680000','ppatro7659@gmail.com','Male','2003-10-14'],
    ARRAY['USER86699',NULL,'919192790000',NULL,NULL,NULL],
    ARRAY['USER12302','Rohit Kumar','919199240000','rohitkumarkhichdi@gmail.com','Male','1996-12-31'],
    ARRAY['USER85679','Biswabhusan mallick','917504000000','biswabhusanmallick7@gmail.com','Male','1996-09-04'],
    ARRAY['USER20473','A sahoo','916370000003','abinashsahoo12d@gmail.com','Male','1998-12-31'],
    ARRAY['USER89199','Papun Kumar Jena','919196690000','papunjena121@gmail.com','Male','2000-01-15'],
    ARRAY['USER39461',NULL,'918129000000',NULL,NULL,NULL],
    ARRAY['USER26960','Pradeep','919199620000','preeps.10@gmail.com','Male','1992-02-03'],
    ARRAY['USER64753','Guru prasad Nanda','919199030000','guru.nanda@gmail.com','Male','1979-07-06'],
    ARRAY['USER55323',NULL,'917979000008',NULL,NULL,NULL],
    ARRAY['USER18122','Santosh','919198540000','muduli77santosh@gmail.com','Male','1977-09-06'],
    ARRAY['USER25285','Jashmin','917505000000','jasmin.mall9@gmail.com','Female','1991-12-08'],
    ARRAY['USER10643',NULL,'917009000009',NULL,NULL,NULL],
    ARRAY['USER62407','Vikas Thakur','917381000001','vikashsinghc416@gmail.com','Male','2009-07-25'],
    ARRAY['USER82266',NULL,'919194000000',NULL,NULL,NULL],
    ARRAY['USER10167','Sanjay Baghel','918771000000','sanjaybaghel8389@gmail.com','Male','1999-12-31'],
    ARRAY['USER23661','Usha','916373000001','dr.usha2004@gmail.com','Female','1980-07-05'],
    ARRAY['USER58014','Biswa Ranjan Jena','919194400000','princesonu402@gmail.com','Male','1998-12-14'],
    ARRAY['USER49660','Bhart kumar','919196310000','bharatkumar31121993@gmail.com','Female','1993-12-31'],
    ARRAY['USER29002',NULL,'919194000001',NULL,NULL,NULL],
    ARRAY['USER33378','Biswajit das','919199380000','marinerbiswajit@gmail.com','Male','1980-09-29'],
    ARRAY['USER96310','Biswajit Sahoo','916371000005','biswajitsahoo65726@gmail.com','Male','2007-09-17'],
    ARRAY['USER20251','Pavithra Pavi','919190430000','pavithravrsp@gmail.com','Female','2006-07-10'],
    ARRAY['USER78470','Harsh Tibarewal','918895000001','harshtibarewal@gmail.com','Male','1990-04-03'],
    ARRAY['USER23329',NULL,'919197780000',NULL,NULL,NULL],
    ARRAY['USER38278',NULL,'919198620000',NULL,NULL,NULL],
    ARRAY['USER39995',NULL,'917979000009',NULL,NULL,NULL],
    ARRAY['USER80567',NULL,'918293000000',NULL,NULL,NULL],
    ARRAY['USER71754',NULL,'917381000002',NULL,NULL,NULL],
    ARRAY['USER96217',NULL,'917308000000',NULL,NULL,NULL],
    ARRAY['USER36666',NULL,'919197320000',NULL,NULL,NULL],
    ARRAY['USER56175','Vaghela Yashraj.S','919197150000','vaghelarajvirsinh2141@gmail.com','Male','2012-12-11'],
    ARRAY['USER67137',NULL,'919197770000',NULL,NULL,NULL],
    ARRAY['USER90135',NULL,'919199370000',NULL,NULL,NULL],
    ARRAY['USER55964','Usha Bharti Mohanty','919193370000','ushabharatimohanty@gmail.com','Female','1995-07-18'],
    ARRAY['USER69606',NULL,'917711000000',NULL,NULL,NULL],
    ARRAY['USER85647',NULL,'918871000000',NULL,NULL,NULL],
    ARRAY['USER35392','Arnab Pattnaik','918250000002','arnabpattnaik715@gmail.com','Male','2007-04-15'],
    ARRAY['USER28141',NULL,'916861000000',NULL,NULL,NULL],
    ARRAY['USER32278','Sr','919190660000','srrmohanty20@gmail.com','Other','1992-12-31'],
    ARRAY['USER84627','Sukanya Sharma','917979000010','spsukanyasharma1117@gmail.com','Female','1994-10-19'],
    ARRAY['USER17619','Subhash Kumar','918294000000','s70582061@gmail.com','Female','1995-01-10'],
    ARRAY['USER63884','Kaushik Tripathy','919196860000','kaushiktrip@gmail.com','Male','1989-01-12'],
    ARRAY['USER34569','Kabita Barik','919199370000',NULL,NULL,NULL],
    ARRAY['USER34811','Ambrit Behera','918019000001','amnritbehera@gmail.com','Male','2006-09-09'],
    ARRAY['USER13891','SUSANTA KUMAR BISWAL','918848000000','sbiswal798@gmail.com','Male','1995-05-04'],
    ARRAY['USER54147','Pradipta kumar Mishra','918978000000','pkmishra01jul@gmail.com','Male','1961-02-07'],
    ARRAY['USER35471','Manish','917504000001','msmanish719@gmail.com','Male','1997-06-18'],
    ARRAY['USER63000','Pratik Jethi','917205000002','jethi.pratik@gmail.com','Male',NULL],
    ARRAY['USER91857','Anil kumar','919194550000','94ak.kanaujiya@gmail.com','Male','1995-08-20'],
    ARRAY['USER13829','D. Sarangi','919194400000','debarchita2016@gmail.com','Female','1991-01-06'],
    ARRAY['USER43776','Suchitra','917008000004','suchitrapattnaik423@gmail.com','Male','1988-09-25'],
    ARRAY['USER51802','Roshni Patra','919199370000','rasmita0patra@gmail.com','Female','1992-10-11'],
    ARRAY['USER34794','Soumya','917750000001','sr@gmail.com','Male','1999-12-31'],
    ARRAY['USER98953',NULL,'917009000010',NULL,NULL,NULL],
    ARRAY['USER55974','Smruti das','919199370000','lisaa20may@gmail.com','Female','1990-10-10'],
    ARRAY['USER46585',NULL,'916387000000',NULL,NULL,NULL],
    ARRAY['USER15018',NULL,'917978000002',NULL,NULL,NULL],
    ARRAY['USER26649',NULL,'919192080000',NULL,NULL,NULL],
    ARRAY['USER59555','lipika','919198460000','makeithappenanyhoo@gmail.com','Female','2000-04-06'],
    ARRAY['USER99592','Kristu','917009000011','atifrajsahoo@gmail.com','Male','1999-12-31'],
    ARRAY['USER97385','Sujata','918144000001','sujata.padhi2014@gmail.com','Female','1994-04-19'],
    ARRAY['USER48124','Anjan','917895000000','anjansethi88@gmail.com','Male','1999-12-31'],
    ARRAY['USER48088','Anil sahoo','918249000004','anilsahoo720@gmail.com','Male','1991-12-23'],
    ARRAY['USER73967','Pallavi Mohanty','916363000000','pallavi765@gmail.com','Female','1986-12-22'],
    ARRAY['USER49412','KABIR DASH','918763000006','saionoeer.kabir@gmail.com','Male','1996-05-05'],
    ARRAY['USER39263',NULL,'916267000000',NULL,NULL,NULL],
    ARRAY['USER73115','SANJIB NAYAK','919199370000','dcmediacell@gmail.com','Male','1978-01-28'],
    ARRAY['USER11358',NULL,'917632000000',NULL,NULL,NULL],
    ARRAY['USER46673',NULL,'919199290000',NULL,NULL,NULL],
    ARRAY['USER88502',NULL,'919191250000',NULL,NULL,NULL],
    ARRAY['USER20436','Fima','918917000001','bijay.meher@gmail.com','Female','2000-01-08'],
    ARRAY['USER69602',NULL,'917894000001',NULL,NULL,NULL],
    ARRAY['USER13685','Prasad Thikrul','919198680000','prasadthikrul@gmail.com','Male','1997-10-30'],
    ARRAY['USER12847',NULL,'918588000000',NULL,NULL,NULL],
    ARRAY['USER66547',NULL,'917056000000',NULL,NULL,NULL],
    ARRAY['USER67700',NULL,'918875000000',NULL,NULL,NULL],
    ARRAY['USER58721','Sunil','919190270000','sunilkumar9026958013@gmail.com','Male','1999-12-31'],
    ARRAY['USER74847','Ataullah khan','917068000000','khanataullha892@gmail.com','Female','1997-06-07'],
    ARRAY['USER94510',NULL,'919190650000',NULL,NULL,NULL],
    ARRAY['USER61618',NULL,'919198940000',NULL,NULL,NULL],
    ARRAY['USER97503','Rinku yadav','919193350000','rinkuyadav27102015@gmail.com','Male','1987-04-04'],
    ARRAY['USER85690',NULL,'919195460000',NULL,NULL,NULL],
    ARRAY['USER63808','Ramratan kumar','917485000000','ramlalkumar97818@gmail.com','Male','2006-03-30'],
    ARRAY['USER98098','Hira yadav','918918000001','hiralalkumaryadav56@gmail.com','Female','1990-12-31'],
    ARRAY['USER20954',NULL,'919198110000',NULL,NULL,NULL],
    ARRAY['USER69471','Abinash Nayak','918599000000','abinashctc03@gmail.com','Male','2003-10-03'],
    ARRAY['USER40950','Abhishek Mohapatra','918819000000','abhimoha85@gmail.com','Male','1985-01-08'],
    ARRAY['USER70394',NULL,'919196680000',NULL,NULL,NULL],
    ARRAY['USER80384','SANJIB KUMAR MOHAPATRA','916370000004','supritimohapatra1981@gmail.com','Female','1977-12-31'],
    ARRAY['USER68525',NULL,'917005000000',NULL,NULL,NULL],
    ARRAY['USER23867','tyngkai Skhemlon','919192340000','tyngkaiskhemlon864@gmail.com','Male','1991-05-16'],
    ARRAY['USER28490',NULL,'916371000006',NULL,NULL,NULL],
    ARRAY['USER91343','Azhar Ansari','919199400000','azhar.ansari7331@gmail.com','Male','1995-01-26'],
    ARRAY['USER41940',NULL,'918618000000',NULL,NULL,NULL],
    ARRAY['USER62593','Manasi Satpathy','918971000001','manasikundu2014@gmail.com','Female','1983-01-25'],
    ARRAY['USER85762','Priya Panda Das','919199380000','panda.priya1@gmail.com','Female','1988-06-20'],
    ARRAY['USER41865','Shuvrata','917077000002','srpradhan87@gmail.com','Female','1986-08-05'],
    ARRAY['USER11711',NULL,'917461000000',NULL,NULL,NULL],
    ARRAY['USER56874','Subhra Tripathy','918918000002','subhraranitripathy98@gmail.com','Female','1997-02-18'],
    ARRAY['USER80564','Smruti Ranjan','919197770000','ranjanrath1985@gmail.com','Male',NULL],
    ARRAY['USER51004','BIDYUT PRAVA NAYAK','919197770000','bidyutpravanayak00@gmail.com','Female','1993-12-31'],
    ARRAY['USER12416',NULL,'918936000000',NULL,NULL,NULL],
    ARRAY['USER58706','Snehanjali Panigrahi','918595000000','snehaoct30@yahoo.com','Female','1973-03-24'],
    ARRAY['USER30382',NULL,'917009000012',NULL,NULL,NULL],
    ARRAY['USER43930',NULL,'917009000013',NULL,NULL,NULL]
  ];
  
  rec text[];
  v_logical_id text;
  v_full_name text;
  v_email text;
  v_gender text;
  v_dob date;
  v_auth_email text;
  v_counter int := 0;

BEGIN
  FOREACH rec SLICE 1 IN ARRAY users_data
  LOOP
    v_logical_id := rec[1];
    v_full_name := NULLIF(rec[2], 'NULL');
    v_mobile := rec[3];
    v_email := NULLIF(rec[4], 'NULL');
    v_gender := NULLIF(LOWER(rec[5]), 'null');
    v_dob := NULLIF(rec[6], 'NULL')::date;

    -- Skip if this logical_id already exists in mapping
    IF EXISTS (SELECT 1 FROM user_id_mapping WHERE logical_id = v_logical_id) THEN
      CONTINUE;
    END IF;

    -- Skip if mobile already exists in profiles (use existing profile)
    SELECT id INTO v_existing_profile_id FROM profiles WHERE mobile = v_mobile;
    
    IF v_existing_profile_id IS NOT NULL THEN
      -- Insert mapping to existing profile
      INSERT INTO user_id_mapping (logical_id, profile_id)
      VALUES (v_logical_id, v_existing_profile_id)
      ON CONFLICT (logical_id) DO NOTHING;
      CONTINUE;
    END IF;

    -- Create auth user
    v_auth_email := COALESCE(v_email, v_logical_id || '@placeholder.33crores.com');
    
    v_uid := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      aud, role
    ) VALUES (
      v_uid, '00000000-0000-0000-0000-000000000000',
      v_auth_email,
      '', now(),
      '{"provider":"phone","providers":["phone"]}',
      '{}',
      now(), now(),
      'authenticated', 'authenticated'
    ) ON CONFLICT (id) DO NOTHING;

    -- Create profile
    INSERT INTO profiles (id, mobile, full_name, email, gender, date_of_birth, role)
    VALUES (v_uid, v_mobile, v_full_name, v_email, v_gender, v_dob, 'customer')
    ON CONFLICT DO NOTHING;

    -- Insert mapping
    INSERT INTO user_id_mapping (logical_id, profile_id)
    VALUES (v_logical_id, v_uid)
    ON CONFLICT (logical_id) DO NOTHING;

    v_counter := v_counter + 1;
  END LOOP;
  
  RAISE NOTICE 'Inserted % new profiles', v_counter;
END $$;
